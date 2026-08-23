// The `why:*` affordances — what a card *offers* a visitor, as opposed to what
// it is about (`what`), when it happened (`when`), where (`where`) or who was
// involved (`who`).
//
// Two of the five `why` values are derived here (`playable`, `buyable`); the
// other three — `viewable` and the two `why:learn/*` topics — are curation
// and are authored by hand, as ordinary `tags:` entries. `viewable` used to be
// derived (image + short body); issue #96 retired that, for the same reason
// `why:learn/travel` was never a generator over the ~154 travel cards: a
// mechanical check answers "does this have a picture", not "is this worth
// looking at", and the two questions have different answers on most of the
// Instagram-era archive.
//
// It then briefly had a bespoke `viewable: always` frontmatter key, which
// issue #116 retired in turn: an authored assertion that a card belongs in a
// filter value is exactly what a tag is, and the two curated siblings were
// already written that way. Suppressing a *derived* affordance is now
// `excludeTags: [generated/playable]` — see exclude-tags.ts.
//
// Pure: every function takes plain card data and returns plain data. The
// generator shell that feeds it lives in filter-generators.ts.
//
// Explicit .ts extensions: this module is reached from filter-generators.ts,
// which Node build scripts load via type stripping (no extension resolution).

import type { Action } from './card-actions.ts';

export const WHY_PLAYABLE = 'why:playable';
export const WHY_VIEWABLE = 'why:viewable';
export const WHY_BUYABLE = 'why:buyable';

/**
 * Every affordance value, in panel order.
 *
 * Wider than what the generator emits: `why:viewable` is authored-only (see the
 * module comment), and is kept here so the short-code manifest covers it from
 * the generator side as well as from its own `.tag.yaml` declaration.
 */
export const WHY_AFFORDANCES = [WHY_PLAYABLE, WHY_VIEWABLE, WHY_BUYABLE] as const;

/** The card data the affordance decisions read. */
export type WhySource = {
  /** Already-resolved action links — see resolveActions in card-actions.ts. */
  actions?: Action[];
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

/**
 * Every affordance tag this card derives, in panel order.
 *
 * Both values are derived from resolved actions and nothing else — there is no
 * "force it on" knob, because authoring the tag IS that knob: an authored
 * `tags: [why/playable]` reaches the card's tag list before any generator
 * runs, and whyAffordanceGenerator dedupes against it. `why:viewable` is
 * absent from this loop entirely for the same reason — nothing derives it, so
 * it is authored or it is not there.
 *
 * `suppressed` carries the `excludeTags: [generated/<key>]` decisions (see
 * exclude-tags.ts), keyed per affordance rather than per generator: a card is
 * routinely playable but not buyable, so `generated/why` would be too blunt a
 * instrument to be the one on offer.
 */
export function deriveWhyTags(
  source: WhySource,
  suppressed: ReadonlySet<string> = new Set(),
): string[] {
  const decided: Array<[string, string, (s: WhySource) => boolean]> = [
    [WHY_PLAYABLE, 'playable', isPlayable],
    [WHY_BUYABLE, 'buyable', isBuyable],
  ];

  const out: string[] = [];
  for (const [value, key, derive] of decided) {
    if (suppressed.has(key)) continue;
    if (derive(source)) out.push(value);
  }
  return out;
}

/** The override keys the affordance generator answers to in `excludeTags`. */
export const WHY_SUPPRESSION_KEYS = ['playable', 'buyable'] as const;
