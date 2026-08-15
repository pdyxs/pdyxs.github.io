// Day-seeded slot selection.
//
// A home slot shows one card drawn from the top of the slot's filtered set,
// held stable for the whole calendar day (in the viewer's local timezone by
// default).
//
// The ordering is the site's ONE ranking chain (ranking.ts) — the same
// comparator the browse lens sorts by, not a second selection rule living here.
// So a slot is "the top `pool` cards this filter leaves, day-seeded": authored
// `priority` decides what is eligible, and the day picks between them.
//
// What this used to be, and why it isn't (issue #83, decided in #68): a
// three-tier displayed → unseen → read preference. `markDisplayed` removed a
// card from the unseen tier, changing that tier's membership and re-rolling the
// pick, so the `displayed` tier existed mainly to undo its own churn. Its one
// real job — walking the visitor through the unseen set — is given up
// deliberately: if you were shown a card and didn't open it, the front page
// failing to show it again is the bug, not the repetition.
//
// Unseen-ness survives as one rung of the shared chain (rung 3), which is the
// right weight for it: it breaks ties between equally-prioritised cards instead
// of overriding the author.

import type { CardMeta } from './cards';
import type { FilterState } from '../dimensions';
import { applyFilters, countSelectedValueMatches, makeMatchContext } from '../dimensions';
import { cardOwnValues } from './card-identity';
import { getViewState } from './card-view-state';
import { rankCards } from './ranking';

/**
 * How many top-ranked cards a slot's day-seed picks between when the slot
 * declares no `pool` of its own. Small enough that a slot stays a curated
 * shortlist rather than a lottery over the whole filter.
 */
export const DEFAULT_SLOT_POOL = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns 'YYYY-MM-DD' for `date` in the given IANA timezone. */
function toDateString(date: Date, timezone: string): string {
  return date.toLocaleDateString('en-CA', { timeZone: timezone });
  // en-CA locale returns ISO-style YYYY-MM-DD
}

/**
 * Simple deterministic numeric hash for a string (djb2 variant).
 * Produces a non-negative 32-bit integer.
 */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** Picks a stable index within an array using a seed string. */
function seededIndex(seed: string, length: number): number {
  if (length === 0) return 0;
  return hashString(seed) % length;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the pre-computed content hash for a card (stored on the card at build time).
 * A different hash means the card's content changed, which resets view state to unseen.
 */
export function contentHashFor(card: CardMeta): string {
  return card.contentHash;
}

/**
 * Selects one card from `cards` after applying `filterState`: the top `pool`
 * cards by the ranking chain, with the calendar day of `date` (in the viewer's
 * timezone) choosing between them.
 *
 * @param timezone - IANA timezone string; defaults to the viewer's local timezone.
 * @param pool - how many top-ranked cards to pick between; defaults to DEFAULT_SLOT_POOL.
 * Returns null if no cards match the filter.
 */
export function selectSlotCard(
  cards: CardMeta[],
  filterState: FilterState,
  date: Date,
  timezone?: string,
  cardBackedValues?: Set<string>,
  pool: number = DEFAULT_SLOT_POOL,
): CardMeta | null {
  const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const backed = cardBackedValues ?? cardOwnValues(cards);
  const filtered = applyFilters(cards, filterState, backed);
  if (filtered.length === 0) return null;

  // The two runtime rungs of the chain. Both are only knowable here: which
  // values are selected is the slot's business, and seen-ness is the visitor's.
  const ctx = makeMatchContext(backed);
  const ranked = rankCards<CardMeta>(filtered, {
    matchCount: card => countSelectedValueMatches(card, filterState, ctx),
    isSeen: card => getViewState(card.uid, contentHashFor(card)) === 'read',
  });

  const shortlist = ranked.slice(0, Math.max(1, pool));
  return shortlist[seededIndex(toDateString(date, tz), shortlist.length)];
}
