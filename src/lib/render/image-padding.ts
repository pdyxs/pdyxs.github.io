/**
 * Header-image padding: the decisions behind `npm run pad:images`.
 *
 * Some source images are cropped flush to their content. The puzzle grids are
 * the worst case — logic-masters exports them with a zero-pixel margin, so a
 * puzzle whose clues sit *outside* the grid frame (Cityscrapers' unknown-clue
 * boxes) has those clues clipped by the image edge, and the full-bleed masthead
 * then butts them against the card border. Others in the same folder look
 * deliberate at the same crop, because nothing pokes out past the grid.
 *
 * That difference is not measurable — every puzzle image is already at 0–1%
 * margin, so no bounding-box heuristic can separate "tight and fine" from
 * "tight and damaged". It needs an eye, once, per image. So the amount is
 * authored: `imagePad: 5%` in the card's frontmatter.
 *
 * **The original is the source of truth, and it is kept.** Padding is applied
 * from `_original/<file>` to `<file>`, never in place — so adjusting a value is
 * editing a number and re-running, not un-padding a padded file. `_original/`
 * is an underscore directory, which `isVaultInfrastructurePath` already treats
 * as vault infrastructure, so it is invisible to the content glob, the gallery
 * sweep and the audit lens.
 *
 * Everything here is pure: the script does the fs and the sharp call.
 */

/** Subfolder of a card directory holding the unpadded source of a padded image. */
export const ORIGINAL_DIR = '_original';

// ─── Pad specs ────────────────────────────────────────────────────────────────

export type PadSpec =
  /** A share of the image's longer side — uniform-looking on non-square images. */
  | { unit: 'percent'; value: number }
  /** An absolute pixel count, for when a specific number is what you want. */
  | { unit: 'px'; value: number };

const PAD_SPEC = /^\s*(\d+(?:\.\d+)?)\s*(%|px)?\s*$/;

/**
 * Reads an authored `imagePad` value.
 *
 * A bare number means pixels, since that is what a bare number means everywhere
 * else an image size is written. Returns `null` for anything unparseable — the
 * caller reports it rather than guessing, because silently treating `5 %` or
 * `5em` as "no padding" is the failure mode this whole feature exists to avoid.
 */
export function parsePadSpec(raw: string | number | undefined | null): PadSpec | null {
  if (raw === undefined || raw === null) return null;
  const match = String(raw).match(PAD_SPEC);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return match[2] === '%' ? { unit: 'percent', value } : { unit: 'px', value };
}

/**
 * Pixels to add on each of the four sides.
 *
 * A percentage resolves against the *longer* side, not each axis independently:
 * padding a 667×1000 image by 5% of its own width and 5% of its own height would
 * put visibly more space above and below than beside it. One reference length
 * keeps the border even the whole way round, which is what "5%" is asking for.
 */
export function resolvePadPixels(spec: PadSpec, width: number, height: number): number {
  if (spec.unit === 'px') return Math.round(spec.value);
  return Math.round((spec.value / 100) * Math.max(width, height));
}

// ─── Background colour ────────────────────────────────────────────────────────

export interface Rgba { r: number; g: number; b: number; alpha: number }

const WHITE: Rgba = { r: 255, g: 255, b: 255, alpha: 1 };

/**
 * What colour the added border is.
 *
 * Sampled from the image's own four corners rather than hardcoded white: the
 * puzzle grids are all white-backed, but a dark or transparent source would get
 * a white frame that reads as damage rather than as breathing room. Corners
 * agree → that is the image's ground, extend it. They disagree → the image
 * bleeds to its edge on purpose and there is no safe guess, so fall back to
 * white and let the author see the result and pick a different value.
 */
export function chooseBackground(corners: Rgba[]): Rgba {
  if (corners.length === 0) return WHITE;
  const [first, ...rest] = corners;
  const same = rest.every(
    (c) => c.r === first.r && c.g === first.g && c.b === first.b && c.alpha === first.alpha
  );
  return same ? first : WHITE;
}

// ─── Planning ─────────────────────────────────────────────────────────────────

/** What the script found on disk for one card, with no interpretation applied. */
export interface PadCandidate {
  /** Card uid (path under src/content), for reporting. */
  uid: string;
  /** The card's `image:` frontmatter value. */
  image?: string;
  /** The card's `imagePad:` frontmatter value. */
  imagePad?: string | number;
  /** Does `_original/<image>` exist? */
  hasOriginal: boolean;
  /** Does `<image>` exist in the card's own folder? */
  hasCurrent: boolean;
}

export type PadAction =
  /** Write `<image>` from `_original/<image>`, padded by `spec`. */
  | { action: 'pad'; uid: string; image: string; spec: PadSpec; adopt: boolean }
  /** Put the unpadded original back — `imagePad` was removed or set to zero. */
  | { action: 'restore'; uid: string; image: string }
  /** Nothing to do. */
  | { action: 'skip'; uid: string }
  /** Authored intent that can't be carried out; reported, never guessed at. */
  | { action: 'error'; uid: string; reason: string };

/**
 * One card's plan.
 *
 * The two non-obvious cases are the ones that make the workflow re-runnable:
 *
 * - **adopt** — `imagePad` set but no `_original/` yet. The file currently in
 *   the card folder *is* the original, so it moves into `_original/` before the
 *   first pad. This is what makes opting in a one-word edit.
 * - **restore** — `imagePad` removed, or explicitly `0`, with an `_original/`
 *   present. Without this, backing a change out would leave the padded file in
 *   place forever with nothing in the frontmatter to explain it. `0` is kept
 *   distinct from absent only in the frontmatter, where it usefully records
 *   "I looked at this one and it needs nothing"; on disk both mean the same.
 */
export function planCardPadding(candidate: PadCandidate): PadAction {
  const { uid, image, hasOriginal, hasCurrent } = candidate;
  const declared = candidate.imagePad !== undefined && String(candidate.imagePad).trim() !== '';

  if (!declared) {
    if (hasOriginal && image) return { action: 'restore', uid, image };
    return { action: 'skip', uid };
  }

  if (!image) {
    return { action: 'error', uid, reason: 'imagePad is set but the card has no image:' };
  }
  if (image.startsWith('http')) {
    return { action: 'error', uid, reason: `imagePad cannot pad the remote image ${image}` };
  }

  const spec = parsePadSpec(candidate.imagePad);
  if (!spec) {
    return {
      action: 'error',
      uid,
      reason: `imagePad: ${candidate.imagePad} is not a length (expected e.g. 5% or 40px)`,
    };
  }

  if (spec.value === 0) {
    if (hasOriginal) return { action: 'restore', uid, image };
    return { action: 'skip', uid };
  }

  if (hasOriginal) return { action: 'pad', uid, image, spec, adopt: false };
  if (hasCurrent) return { action: 'pad', uid, image, spec, adopt: true };

  return { action: 'error', uid, reason: `image: ${image} does not exist in the card folder` };
}

/** Plans every candidate, in input order. */
export function planImagePadding(candidates: PadCandidate[]): PadAction[] {
  return candidates.map(planCardPadding);
}

// ─── Reporting ────────────────────────────────────────────────────────────────

export interface PadSummary {
  padded: number;
  restored: number;
  skipped: number;
  errors: { uid: string; reason: string }[];
}

/**
 * Folds a plan into the run summary the script prints.
 *
 * The report is the safety net that the schema isn't: zod strips unknown
 * frontmatter keys rather than rejecting them, so a typo (`imagePadding: 5%`)
 * is silent at build time. Seeing "18 skipped" after setting a value is how you
 * find out.
 */
export function summarise(actions: PadAction[]): PadSummary {
  const summary: PadSummary = { padded: 0, restored: 0, skipped: 0, errors: [] };
  for (const action of actions) {
    if (action.action === 'pad') summary.padded++;
    else if (action.action === 'restore') summary.restored++;
    else if (action.action === 'skip') summary.skipped++;
    else summary.errors.push({ uid: action.uid, reason: action.reason });
  }
  return summary;
}
