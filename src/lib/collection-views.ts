import type { CollectionEntry } from 'astro:content';
import { getCardsForTag, type CardMeta } from './cards';
import type { TagOption } from './collection-browser';
export type { TagOption } from './collection-browser';

export function getAvailableTagsForCards(
  cards: CardMeta[],
  allTags: CollectionEntry<'tag'>[]
): TagOption[] {
  return allTags
    .map(tag => {
      const matching = getCardsForTag(tag, cards);
      return { id: tag.id, name: tag.data.name, count: matching.length, uids: matching.map(c => c.uid) };
    })
    .filter(t => t.count > 0)
    .sort((a, b) => b.count - a.count);
}
