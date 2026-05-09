import type { CollectionEntry } from 'astro:content';
import { getCardsForTag, type CardMeta } from './cards';
import type { TagOption } from './collection-browser';
export type { TagOption } from './collection-browser';

export function getAvailableTagsForCards(
  cards: CardMeta[],
  allTags: CollectionEntry<'tag'>[]
): TagOption[] {
  return allTags
    .map(tag => ({ id: tag.id, name: tag.data.name, count: getCardsForTag(tag, cards).length }))
    .filter(t => t.count > 0)
    .sort((a, b) => b.count - a.count);
}
