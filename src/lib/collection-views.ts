import type { CollectionEntry } from 'astro:content';
import { getCardsForTag, type CardMeta } from './cards';

export type TagOption = { id: string; name: string; count: number };

export function getAvailableTagsForCards(
  cards: CardMeta[],
  allTags: CollectionEntry<'tag'>[]
): TagOption[] {
  return allTags
    .map(tag => ({ id: tag.id, name: tag.data.name, count: getCardsForTag(tag, cards).length }))
    .filter(t => t.count > 0)
    .sort((a, b) => b.count - a.count);
}

export function filterCardsByTag(cards: CardMeta[], tag: string | null): CardMeta[] {
  if (!tag) return cards;
  const lower = tag.toLowerCase();
  return cards.filter(c => c.tags.some(t => t.toLowerCase() === lower));
}
