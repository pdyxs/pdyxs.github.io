// Client-safe utilities for CollectionBrowser — no astro:content dependency.

export type TagOption = { id: string; name: string; count: number };

// Minimal card shape needed client-side; CardMeta satisfies this structurally.
export type CardDisplay = {
  uid: string;
  title: string;
  description?: string;
  date?: Date;
  tags: string[];
};

export function filterCardsByTag<T extends CardDisplay>(cards: T[], tag: string | null): T[] {
  if (!tag) return cards;
  const lower = tag.toLowerCase();
  return cards.filter(c => c.tags.some(t => t.toLowerCase() === lower));
}
