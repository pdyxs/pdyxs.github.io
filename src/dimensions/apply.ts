// Filter evaluation — one fold over the dimension registry.
import type { CardMeta } from '../lib/cards';
import { cardOwnValues } from '../lib/card-identity';
import { DIMENSIONS } from './registry';
import type { FilterState, MatchContext } from './types';

/**
 * Returns the cards that satisfy every active dimension.
 *
 * Each dimension decides for itself what "satisfy" means; a dimension with no
 * selection returns true for every card (the identity), which is what makes
 * this fold correct without any per-kind special-casing. The contract test
 * pins that identity for every registered dimension.
 *
 * `cardBackedValues` must be derived from the FULL card set, not from `cards`.
 * Whether a tag points at a specific card is a property of the content graph,
 * not of whatever pool is currently in view — and the browse pool is
 * listing-filtered (LensStackCard.astro), so a draft or unlisted target card
 * is missing from it. Deriving the set from `cards` therefore fails *open*:
 * the tag silently degrades to an ordinary hierarchical tag and prefix-matches
 * into its ancestor category, filing every post that links to a draft card
 * under that card's parent. Omitting the argument keeps the pool-derived
 * behaviour, which is correct only when `cards` is already the full set (as in
 * self-contained tests).
 */
export function applyFilters(
  cards: CardMeta[],
  state: FilterState,
  cardBackedValues: Set<string> = cardOwnValues(cards),
): CardMeta[] {
  const ctx = { cardBackedValues };
  return cards.filter(card => DIMENSIONS.every(d => d.matches(card, state[d.id], ctx)));
}

/**
 * How many of the *individually selected* filter values a card matches —
 * the top rung of the ranking comparator (see ranking.ts, issue #80): with
 * several values selected in one dimension, cards matching more of them come
 * first.
 *
 * `applyFilters` can't answer this: values within a dimension OR, so `matches`
 * collapses "matched three of them" and "matched one" into the same `true`. So
 * each selected value is asked separately, as a selection of its own — built
 * with the dimension's own `toggle` from nothing, since a selection's shape
 * belongs to the dimension and this fold must not assume it is an array.
 *
 * Zero for an unfiltered pool, which makes rung 1 a no-op there rather than a
 * special case.
 */
export function countSelectedValueMatches(
  card: CardMeta,
  state: FilterState,
  ctx: MatchContext,
): number {
  let count = 0;
  for (const dimension of DIMENSIONS) {
    for (const value of dimension.values(state[dimension.id])) {
      const single = dimension.toggle(undefined, value);
      if (single !== undefined && dimension.matches(card, single, ctx)) count++;
    }
  }
  return count;
}
