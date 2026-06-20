import type { OrgEntry } from '../data/org-history';

/**
 * Look up which organisation Paul was part of on a given date.
 * Returns the `who:<slug>` tag string, or null if no entry covers the date.
 *
 * Date comparison is string-based on ISO "YYYY-MM-DD" for simplicity and
 * because the input Date values come from Astro's `z.coerce.date()` which
 * normalises to UTC midnight. We compare by converting to "YYYY-MM-DD".
 */
export function lookupOrgForDate(date: Date, history: OrgEntry[]): string | null {
  const dateStr = date.toISOString().slice(0, 10); // "YYYY-MM-DD"

  for (const entry of history) {
    const after = dateStr >= entry.from;
    const before = entry.to === null || dateStr <= entry.to;
    if (after && before) {
      return `who:${entry.slug}`;
    }
  }

  return null;
}

/**
 * Inject the derived `who:*` tag into a card's tag array.
 *
 * Rules:
 * - If the card already has any `who:*` tags (frontmatter override), return
 *   the original array unchanged — frontmatter always wins.
 * - Otherwise, if derivedWhoTag is non-null, append it and return the new array.
 * - If derivedWhoTag is null and there are no frontmatter `who:` tags, return
 *   the original array unchanged.
 *
 * The original array is never mutated.
 */
export function injectWhoTags(cardTags: string[], derivedWhoTag: string | null): string[] {
  const hasWhoTag = cardTags.some(t => t.startsWith('who:'));

  if (hasWhoTag) {
    // Frontmatter override: preserve exactly what the author wrote
    return cardTags;
  }

  if (derivedWhoTag === null) {
    return cardTags;
  }

  return [...cardTags, derivedWhoTag];
}
