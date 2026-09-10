// The promotion decision: which paths cross from `dev` to `main`, and how.
//
// Pure, per the project's decisions-are-pure rule — scripts/promote.mjs is the
// git shell around it. See docs/plans/publishing-pipeline.md §5 and issue #175.
//
// THE LOAD-BEARING PROPERTY is that nothing is inherited. Every run states the
// tree from `dev`'s CURRENT frontmatter and the CURRENT code decision, so a
// card withheld ten times still crosses the moment it is ticked. That is why
// the promotion commit's tree is asserted from a diff rather than produced by
// a merge: a merge commit advances the merge-base past every path it claims to
// have merged, so anything reverted after it is, to git, already handled — and
// a card withheld once would be withheld FOREVER.
//
// THE UNIT IS THE CARD DIRECTORY, not index.md. A card owns its colocated
// assets (its header image, its gallery files, _original/), and a pathspec of
// index.md alone would promote a card's text while stranding every image it
// references — a broken card on production, with nothing to say why.

/** What decides when a card crosses. */
export type CardPromotion =
  /** Ready, and rides the next daily content run. */
  | 'content'
  /** Ready, but held for the next CODE promotion (`awaitsCode: true`). */
  | 'code'
  /** Not ready — `inspected` is not true. Withheld from production. */
  | 'withheld';

/** The subset of a card's frontmatter this decision reads. */
export interface CardGateFields {
  inspected?: boolean;
  awaitsCode?: boolean;
}

/**
 * Which promotion run a card rides.
 *
 * `inspected` is the gate and `awaitsCode` only selects a trigger, so an
 * uninspected card is `withheld` whatever else it says — checking the gate
 * first is what stops `awaitsCode: true` reading as a way to publish something
 * nobody has read.
 *
 * Absent `inspected` counts as false, matching audit.ts's `not-inspected`
 * detect and the `why:uninspected` facet, so the site has ONE definition of
 * inspected shared by the audit lens, the facet and the gate.
 */
export function classifyCard(fm: CardGateFields | undefined): CardPromotion {
  if (fm?.inspected !== true) return 'withheld';
  return fm.awaitsCode === true ? 'code' : 'content';
}

/** One line of `git diff --name-status`, already parsed. */
export interface DiffEntry {
  status: 'A' | 'M' | 'D' | 'T';
  path: string;
}

/**
 * Parses `git diff --name-status -z`'s output.
 *
 * NUL-delimited because a content path may contain anything a filesystem
 * allows, and a tab-split loop over line-delimited output would corrupt the
 * first path with a space that git chose to quote.
 *
 * Renames are REJECTED rather than handled: the caller passes --no-renames, so
 * an R status means that flag was dropped, and a rename silently parsed as its
 * similarity score ("R100") would put an unrelated path through the wrong arm
 * of the plan. Failing here is how that stays impossible.
 */
export function parseNameStatus(raw: string): DiffEntry[] {
  const fields = raw.split('\0').filter((f) => f.length > 0);
  const out: DiffEntry[] = [];

  for (let i = 0; i < fields.length; i += 2) {
    const status = fields[i]!;
    const path = fields[i + 1];
    if (path === undefined) {
      throw new Error(`promotion: diff status "${status}" has no path — truncated output?`);
    }
    if (status === 'A' || status === 'M' || status === 'D' || status === 'T') {
      out.push({ status, path });
      continue;
    }
    throw new Error(
      `promotion: unexpected diff status "${status}" for "${path}". ` +
        `Renames and copies must be off (--no-renames); anything else is unhandled.`,
    );
  }
  return out;
}

/** Paths under src/content that are never promoted, whatever else is true. */
const CONTENT_NEVER = ['src/content/.trash/', 'src/content/.obsidian/'];

/**
 * Generated files that live outside src/content but are a function OF it, and
 * so cross on a content run rather than waiting for a code promotion.
 *
 * The test is not "is it generated" — most generated files are code-derived
 * and correctly promote as code (lenses.generated.ts from *.lens.yaml,
 * lens-icons from the SVGs, dither from constants). It is
 * **content-derived AND seeded by its own committed copy**:
 *
 *   - the two manifests: `assignCodes` NEVER prunes and never reassigns, so
 *     the committed file is the authoritative record of which short code
 *     belongs to which uid. Let main's copy lag and main's own prebuild hands
 *     out ITS next free code to a newly promoted card — a code dev already
 *     spent on something else. Short codes ride in shared stack URLs
 *     (`?to=8l`), so the same link would then mean different things on
 *     preview and production.
 *   - vimeo-posters: incremental by the same logic — an id already in the map
 *     is never re-fetched — so a lagging copy makes the deploy build depend on
 *     a live Vimeo round trip it should not need.
 *
 * `redirects.generated.ts` deliberately is NOT here: it is re-derived wholesale
 * every run and only keeps its existing file as a FAILURE fallback, so main's
 * own prebuild is authoritative and promoting it would say nothing.
 *
 * Crossing these while cards are still withheld is correct, not a leak: main's
 * prebuild refreshes titles wholesale and drops the field for any card absent
 * from its tree, so a withheld card contributes a reserved code and no title.
 */
const CONTENT_DERIVED_PATHS: readonly string[] = [
  'src/data/stack-manifest.json',
  'src/data/tag-manifest.json',
  'src/data/vimeo-posters.generated.ts',
];

/** Whether a path is a generated file that travels with content. */
export function isContentDerivedPath(path: string): boolean {
  return CONTENT_DERIVED_PATHS.includes(path);
}

/**
 * The nearest ancestor directory of `path` that is a card, or undefined.
 *
 * `cardDirs` must be the UNION of dev's and main's card directories: a deleted
 * card is gone from dev, and its files must still resolve to an owner or the
 * deletion would be misfiled as structure and cross as code.
 */
export function ownerCardDir(path: string, cardDirs: ReadonlySet<string>): string | undefined {
  let cut = path.lastIndexOf('/');
  while (cut > 0) {
    const dir = path.slice(0, cut);
    if (cardDirs.has(dir)) return dir;
    cut = path.lastIndexOf('/', cut - 1);
  }
  return undefined;
}

export interface PromotionInput {
  /** `git diff --name-status --no-renames -z main dev`, parsed. */
  diff: readonly DiffEntry[];
  /** Card directory -> how it is classified on `dev`. Absent means gone from dev. */
  cardsOnDev: ReadonlyMap<string, CardPromotion>;
  /** Every card directory on `main` — the other half of the owner lookup. */
  cardDirsOnMain: ReadonlySet<string>;
  /** Whether this run promotes code. */
  promoteCode: boolean;
}

export interface PromotionPlan {
  /** Paths to take from `dev` (`git checkout dev -- <path>`). */
  checkout: string[];
  /** Paths to drop from `main` (`git rm`). */
  remove: string[];
  /** Card dirs promoted on the code trigger — their `awaitsCode` is consumed. */
  awaitsCodeConsumed: string[];
}

/**
 * Whether a path is structure rather than card content.
 *
 * `src/content`'s YAML (`_config.yaml`, `*.tag.yaml`, `*.lens.yaml`) and the
 * generated `_templates/` scaffolds have no `inspected` flag and never will —
 * nobody reads a `_config.yaml` end to end. They are edited in the repo, never
 * from Obsidian mobile, and a lens YAML plus the generator that reads it are
 * ONE change; splitting them across two gates is how half of it ships. So they
 * promote as code (issue #165 found them stranded in neither pathspec).
 */
function isStructurePath(path: string): boolean {
  if (!path.startsWith('src/content/')) return true;
  return path.endsWith('.yaml') || path.startsWith('src/content/_templates/');
}

/**
 * The tree `main` should be asserted to.
 *
 * Deletions of a card that is GONE FROM DEV cross ungated: a deleted card has
 * no frontmatter for `inspected` to answer from, and the gate exists to stop
 * unfinished work being published — a retraction is the opposite act, and
 * holding one back is worse than shipping it.
 */
export function planPromotion(input: PromotionInput): PromotionPlan {
  const { diff, cardsOnDev, cardDirsOnMain, promoteCode } = input;

  const allCardDirs = new Set<string>([...cardsOnDev.keys(), ...cardDirsOnMain]);
  const plan: PromotionPlan = { checkout: [], remove: [], awaitsCodeConsumed: [] };
  const consumed = new Set<string>();

  for (const { status, path } of diff) {
    if (CONTENT_NEVER.some((prefix) => path.startsWith(prefix))) continue;

    let include: boolean;

    if (isContentDerivedPath(path)) {
      include = true;
    } else if (isStructurePath(path)) {
      include = promoteCode;
    } else {
      const owner = ownerCardDir(path, allCardDirs);
      if (owner === undefined) {
        // Under src/content, not a .yaml, and owned by no card — a stray file.
        // Treated as structure so it is never silently dropped; a code
        // promotion carries it and a content run leaves it alone.
        include = promoteCode;
      } else {
        const classification = cardsOnDev.get(owner);
        if (classification === undefined) {
          include = true; // the card is gone from dev — an ungated retraction
        } else if (classification === 'content') {
          include = true;
        } else if (classification === 'code') {
          include = promoteCode;
          if (include && !consumed.has(owner)) {
            consumed.add(owner);
            plan.awaitsCodeConsumed.push(owner);
          }
        } else {
          include = false; // withheld
        }
      }
    }

    if (!include) continue;
    if (status === 'D') plan.remove.push(path);
    else plan.checkout.push(path);
  }

  plan.checkout.sort();
  plan.remove.sort();
  plan.awaitsCodeConsumed.sort();
  return plan;
}

/**
 * Card directories nested inside another card directory.
 *
 * Always empty today, and the promotion asserts it stays that way: the unit of
 * promotion is the card directory, so a card inside a card would have its
 * subtree promoted by its ancestor's gate rather than its own — silently
 * publishing an uninspected card because the folder above it was ticked.
 */
export function nestedCardDirs(cardDirs: Iterable<string>): string[] {
  const all = [...cardDirs].sort();
  return all.filter((dir) => all.some((other) => other !== dir && dir.startsWith(other + '/')));
}
