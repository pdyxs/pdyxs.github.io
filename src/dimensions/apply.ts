// Filter evaluation — one fold over the dimension registry.
import type { CardMeta } from '../lib/cards';
import { cardOwnValues } from '../lib/card-identity';
import { DIMENSIONS } from './registry';
import type { FilterState } from './types';

/**
 * Returns the cards that satisfy every active dimension.
 *
 * Each dimension decides for itself what "satisfy" means; a dimension with no
 * selection returns true for every card (the identity), which is what makes
 * this fold correct without any per-kind special-casing. The contract test
 * pins that identity for every registered dimension.
 */
export function applyFilters(cards: CardMeta[], state: FilterState): CardMeta[] {
  const ctx = { cardBackedValues: cardOwnValues(cards) };
  return cards.filter(card => DIMENSIONS.every(d => d.matches(card, state[d.id], ctx)));
}
