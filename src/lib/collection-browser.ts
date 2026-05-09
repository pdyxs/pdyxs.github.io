// Client-safe utilities for CollectionBrowser — no astro:content dependency.

// uids: pre-computed matching card UIDs from the server (alias-aware via getCardsForTag).
export type TagOption = { id: string; name: string; count: number; uids: string[] };

// Minimal card shape needed client-side; CardMeta satisfies this structurally.
export type CardDisplay = {
  uid: string;
  title: string;
  description?: string;
  date?: Date;
  tags: string[];
};

export function filterCardsByTag<T extends CardDisplay>(
  cards: T[],
  tag: string | null,
  availableTags: TagOption[]
): T[] {
  if (!tag) return cards;
  const tagOption = availableTags.find(t => t.id === tag);
  if (!tagOption) return [];
  const uidSet = new Set(tagOption.uids);
  return cards.filter(c => uidSet.has(c.uid));
}
