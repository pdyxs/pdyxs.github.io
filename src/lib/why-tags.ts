// The `why:*` affordances — what a card *offers* a visitor, as opposed to what
// it is about (`what`), when it happened (`when`), where (`where`) or who was
// involved (`who`).
//
// Three of the five `why` values are derived here; the other two
// (`why:learn/*`) are curation and are authored by hand, because a generator
// that could tag them would tag all ~154 travel cards and the whole point is
// the handful worth reading.
//
// Pure: every function takes plain card data and returns plain data. The
// generator shell that feeds it lives in filter-generators.ts.
//
// Explicit .ts extensions: this module is reached from filter-generators.ts,
// which Node build scripts load via type stripping (no extension resolution).

import type { Action } from './card-actions.ts';
import { EXCERPT_MAX_LENGTH, stripMarkdown } from './description.ts';

export const WHY_PLAYABLE = 'why:playable';
export const WHY_VIEWABLE = 'why:viewable';
export const WHY_BUYABLE = 'why:buyable';

/** Every affordance value the generator can emit, in panel order. */
export const WHY_AFFORDANCES = [WHY_PLAYABLE, WHY_VIEWABLE, WHY_BUYABLE] as const;

/**
 * The longest markdown-stripped body that still counts as a caption rather
 * than a read: two summaries' worth (resolveDescription truncates a body to
 * EXCERPT_MAX_LENGTH to make one). Under this, the words are describing the
 * picture; over it, the picture is illustrating the words.
 *
 * At 320 this covers 133 cards — 121 of the Instagram-era micro-posts, ten
 * project cards, and only two story chapters. Doubling it again pulls in
 * chapters of prose, which is exactly what `viewable` should not mean.
 */
export const VIEWABLE_MAX_PROSE = EXCERPT_MAX_LENGTH * 2;

/** The card data the affordance decisions read. */
export type WhySource = {
  /** Already-resolved action links — see resolveActions in card-actions.ts. */
  actions?: Action[];
  /** Frontmatter `image`: a bare colocated filename or a remote URL. */
  image?: string;
  /** The card's raw markdown body. */
  body?: string;
};

/** True when the card carries at least one action of the given kind. */
function hasActionKind(source: WhySource, kind: Action['kind']): boolean {
  return (source.actions ?? []).some(action => action.kind === kind);
}

/**
 * `why:playable` — there is something you can go and do right now.
 *
 * One signal, because resolveActions already unified the two: a puzzle's
 * `sudokupad_url` folds into a `play` action there, so all 20 puzzles qualify
 * through the same predicate as a game with a store or prototype link. This is
 * why `solvable` is not a separate value (see #68): every puzzle is playable,
 * and the split would buy nothing.
 */
export function isPlayable(source: WhySource): boolean {
  return hasActionKind(source, 'play');
}

/**
 * `why:viewable` — the card is something to look at.
 *
 * A header image plus a body short enough to be its caption. The image alone
 * says almost nothing (246 of 296 cards have one); it is the *absence* of an
 * essay behind it that means the picture is the content.
 *
 * The failure mode is a genuinely visual card with a long write-up — the art
 * pieces sit just over the line — which is what the `viewable: always`
 * frontmatter override is for.
 */
export function isViewable(source: WhySource): boolean {
  if (!source.image) return false;
  return stripMarkdown(source.body ?? '').length <= VIEWABLE_MAX_PROSE;
}

/**
 * `why:buyable` — you can buy the thing.
 *
 * Deliberately narrow: a store link to software is `play` (the store is how
 * you get to play it), so this is only the shop selling an object. Exactly one
 * card qualifies today, with a second project coming — a one-result filter at
 * launch is the expected state, not a bug.
 */
export function isBuyable(source: WhySource): boolean {
  return hasActionKind(source, 'buy');
}

/** The frontmatter/`_config.yaml` key that overrides each affordance. */
export const WHY_OVERRIDE_KEYS = ['playable', 'viewable', 'buyable'] as const;

/** Forces the affordance on; the derivation is not consulted. */
export const WHY_ALWAYS = 'always';
/** Forces the affordance off, whatever the card's actions or body say. */
export const WHY_NEVER = 'never';

/**
 * Every affordance tag this card carries, in panel order.
 *
 * Each value's own override key wins outright over its derivation — the same
 * hybrid as `era`/`location`, split three ways because the three affordances
 * are independent facts and a card is routinely two of them. An unrecognised
 * override value falls through to the derivation rather than suppressing it:
 * a typo should leave the card as it was, not silently drop it out of a filter.
 */
export function deriveWhyTags(
  source: WhySource,
  overrides: Record<string, string | undefined> = {},
): string[] {
  const decided: Array<[string, string, (s: WhySource) => boolean]> = [
    [WHY_PLAYABLE, 'playable', isPlayable],
    [WHY_VIEWABLE, 'viewable', isViewable],
    [WHY_BUYABLE, 'buyable', isBuyable],
  ];

  const out: string[] = [];
  for (const [value, key, derive] of decided) {
    const override = overrides[key];
    if (override === WHY_NEVER) continue;
    if (override === WHY_ALWAYS || derive(source)) out.push(value);
  }
  return out;
}
