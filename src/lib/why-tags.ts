// The `why:*` affordances — what a card *offers* a visitor, as opposed to what
// it is about (`what`), when it happened (`when`), where (`where`) or who was
// involved (`who`).
//
// Two of the five `why` values are derived here (`playable`, `buyable`); the
// other three — `viewable` and the two `why:learn/*` topics — are curation
// and are authored by hand. `viewable` used to be derived (image + short
// body); issue #96 retired that in favour of `viewable: always` alone, for
// the same reason `why:learn/travel` was never a generator over the ~154
// travel cards: a mechanical check answers "does this have a picture", not
// "is this worth looking at", and the two questions have different answers
// on most of the Instagram-era archive.
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

/** Every affordance value the generator can emit, in panel order. */
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

/** The frontmatter/`_config.yaml` key that overrides each affordance. */
export const WHY_OVERRIDE_KEYS = ['playable', 'viewable', 'buyable'] as const;

/** Forces the affordance on; the derivation is not consulted. */
export const WHY_ALWAYS = 'always';
/** Forces the affordance off, whatever the card's actions or body say. */
export const WHY_NEVER = 'never';

/** `why:viewable` is never derived — see the module comment. Its slot in
 * the uniform decision loop below always declines, so only `viewable: always`
 * ever adds the tag. */
function neverDerived(_source: WhySource): boolean {
  return false;
}

/**
 * Every affordance tag this card carries, in panel order.
 *
 * Each value's own override key wins outright over its derivation — the same
 * hybrid `era`/`location` use, split three ways because the three affordances
 * are independent facts and a card is routinely two of them. An unrecognised
 * override value falls through to the derivation rather than suppressing it:
 * a typo should leave the card as it was, not silently drop it out of a filter.
 * For `playable`/`buyable` that derivation is a real check; for `viewable`
 * it's `neverDerived`, so the override IS the mechanism, not an escape hatch
 * from one.
 */
export function deriveWhyTags(
  source: WhySource,
  overrides: Record<string, string | undefined> = {},
): string[] {
  const decided: Array<[string, string, (s: WhySource) => boolean]> = [
    [WHY_PLAYABLE, 'playable', isPlayable],
    [WHY_VIEWABLE, 'viewable', neverDerived],
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
