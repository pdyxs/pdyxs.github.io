// Day-seeded slot selection.
//
// Given a filtered card set and a date, selects one card stably for the
// entire calendar day (in the viewer's local timezone by default).
// Preference order: displayed (same day) → unseen → read.
//
// A card marked displayed today is "today's pick" and is returned on every
// subsequent call within the same calendar day.  Displayed cards from a prior
// calendar day fall into the read tier so they are no longer actively
// preferred, but can still be selected as fallback.

import type { CardMeta } from './cards';
import type { FilterState } from '../dimensions';
import { applyFilters } from '../dimensions';
import { getViewState, getDisplayedDate } from './card-view-state';

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
 * Selects one card from `cards` after applying `filterState`, using the
 * calendar day of `date` (in the viewer's timezone) as a stable seed.
 *
 * Preference order: displayed (same calendar day) > unseen > read.
 * Displayed cards from a prior calendar day fall into the read tier.
 *
 * @param timezone - IANA timezone string; defaults to the viewer's local timezone.
 * Returns null if no cards match the filter.
 */
export function selectSlotCard(
  cards: CardMeta[],
  filterState: FilterState,
  date: Date,
  timezone?: string,
  cardBackedValues?: Set<string>,
): CardMeta | null {
  const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const filtered = applyFilters(cards, filterState, cardBackedValues);
  if (filtered.length === 0) return null;

  const daySeed = toDateString(date, tz);

  // Partition into preference tiers
  const unseen: CardMeta[] = [];
  const displayed: CardMeta[] = [];
  const read: CardMeta[] = [];

  for (const card of filtered) {
    const hash = contentHashFor(card);
    const state = getViewState(card.uid, hash);
    if (state === 'unseen') {
      unseen.push(card);
    } else if (state === 'displayed') {
      // Only keep in "displayed" tier if displayed on today's calendar day;
      // prior-day displayed cards fall to the read tier.
      const displayedDate = getDisplayedDate(card.uid, hash);
      if (displayedDate === daySeed) displayed.push(card);
      else read.push(card);
    } else {
      read.push(card);
    }
  }

  // Pick from the highest-priority non-empty tier.
  // displayed_today wins: once a card is selected and marked displayed for this
  // calendar day, subsequent calls return the same card.
  const tierName = displayed.length > 0 ? 'displayed' : unseen.length > 0 ? 'unseen' : 'read';
  const tier = tierName === 'unseen' ? unseen : tierName === 'displayed' ? displayed : read;

  // Combine day seed with tier name so selection changes when moving between tiers
  const seed = `${daySeed}:${tierName}`;
  const idx = seededIndex(seed, tier.length);
  return tier[idx];
}
