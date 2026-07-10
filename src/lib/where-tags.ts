import type { TravelEntry } from '../data/travel-log';

/**
 * Look up the `where:*` tag value for a given date by scanning the travel log.
 *
 * The travel log is an array of non-overlapping entries, each covering an
 * inclusive date range [from, to] (or [from, ∞) when `to` is null).
 *
 * Returns `"where:<location>"` for the matching entry, or `null` if the date
 * falls in a gap between entries (or before all entries).
 *
 * @param date   - The card's date (from frontmatter, already a JS Date)
 * @param log    - The travel log array to search
 */
export function lookupLocationForDate(date: Date, log: TravelEntry[]): string | null {
  // Normalise the date to a plain YYYY-MM-DD string for range comparison so
  // we are not tripped up by time-of-day offsets.
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;

  for (const entry of log) {
    if (dateStr < entry.from) continue;           // before this entry starts
    if (entry.to !== null && dateStr > entry.to) continue; // after this entry ends
    return `where:${entry.location}`;
  }

  return null;
}

/**
 * Append a derived `where:*` tag to a card's existing tag list.
 *
 * The `where` dimension is dual-purpose: authored `where:work/*` tags coexist
 * with generator-derived geographic tags, so this no longer skips when a
 * `where:*` tag is already present. Overriding the *derived* value is the
 * generator's job (via the `location` override key, see filter-generators.ts) —
 * by the time we get here, `derivedWhereTag` is already the value to append.
 *
 * Rules:
 * - If `derivedWhereTag` is null, return `cardTags` unchanged.
 * - If `derivedWhereTag` is already present (exact match), return `cardTags`
 *   unchanged (dedup).
 * - Otherwise append it and return the new list.
 *
 * @param cardTags        - The tags already present on the card (from frontmatter / defaults)
 * @param derivedWhereTag - The tag to inject (from an override or `lookupLocationForDate`), or null
 */
export function injectWhereTags(cardTags: string[], derivedWhereTag: string | null): string[] {
  if (derivedWhereTag === null) {
    return cardTags;
  }

  if (cardTags.includes(derivedWhereTag)) {
    return cardTags;
  }

  return [...cardTags, derivedWhereTag];
}
