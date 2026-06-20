// Day-seeded slot selection.
//
// Given a filtered card set and the current date in Sydney timezone, selects
// one card stably for the entire calendar day. Preference order:
//   unseen → displayed → read
// Within the top-priority tier the selection is seeded by the Sydney-timezone
// date string (YYYY-MM-DD) so the same card is always selected on a given day.

import type { CardMeta } from './cards';
import type { FilterState } from './filters';
import { applyFilters } from './filters';
import { getViewState } from './card-view-state';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the date as 'YYYY-MM-DD' in Australia/Sydney timezone. */
function toSydneyDateString(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
  // en-CA locale returns ISO-style YYYY-MM-DD
}

/**
 * Simple deterministic numeric hash for a string.
 * Produces a non-negative 32-bit integer.
 * Uses djb2 variant.
 */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0; // keep 32-bit unsigned
  }
  return h;
}

/**
 * Picks a stable index within an array using a seed string.
 */
function seededIndex(seed: string, length: number): number {
  if (length === 0) return 0;
  return hashString(seed) % length;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Selects one card from `cards` after applying `filterState`, using the
 * Sydney-timezone calendar day of `date` as a stable seed.
 *
 * Preference order: unseen > displayed > read.
 * Within the top-priority tier, the selection is deterministic for a given day.
 *
 * Returns null if no cards match the filter.
 */
export function selectSlotCard(
  cards: CardMeta[],
  filterState: FilterState,
  date: Date
): CardMeta | null {
  const filtered = applyFilters(cards, filterState);
  if (filtered.length === 0) return null;

  const daySeed = toSydneyDateString(date);

  // Partition into preference tiers
  const unseen: CardMeta[] = [];
  const displayed: CardMeta[] = [];
  const read: CardMeta[] = [];

  for (const card of filtered) {
    const state = getViewState(card.uid, contentHashFor(card));
    if (state === 'unseen') unseen.push(card);
    else if (state === 'displayed') displayed.push(card);
    else read.push(card);
  }

  // Pick from the highest-priority non-empty tier
  const tier = unseen.length > 0 ? unseen : displayed.length > 0 ? displayed : read;

  // Use a seed combining day and tier identity so the selection changes between
  // tiers (when all unseen are exhausted on a new day, don't accidentally pick
  // the same index from displayed tier)
  const tierName = unseen.length > 0 ? 'unseen' : displayed.length > 0 ? 'displayed' : 'read';
  const seed = `${daySeed}:${tierName}`;

  const idx = seededIndex(seed, tier.length);
  return tier[idx];
}

// ---------------------------------------------------------------------------
// Content hash utility (exported for use by callers that want to pass the hash)
// ---------------------------------------------------------------------------

/**
 * Computes a content hash string for a card based on its title and description.
 * Different content → different hash, which resets the view state to unseen.
 */
export function contentHashFor(card: CardMeta): string {
  const str = `${card.title}||${card.description ?? ''}`;
  return String(hashString(str));
}
