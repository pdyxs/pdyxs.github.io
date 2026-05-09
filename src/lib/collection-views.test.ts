import { describe, it, expect } from 'vitest';
import { getAvailableTagsForCards, filterCardsByTag } from './collection-views';
import { fakeCardMeta, fakeTagEntry } from '../test/fixtures';

describe('getAvailableTagsForCards', () => {
  it('getAvailableTagsForCards_includes_tags_with_matches', () => {
    const tag = fakeTagEntry({ id: 'games', name: 'Games', aliases: ['game'] });
    const card = fakeCardMeta({ tags: ['games'] });
    const result = getAvailableTagsForCards([card], [tag]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('games');
    expect(result[0].count).toBe(1);
  });

  it('getAvailableTagsForCards_excludes_empty_tags', () => {
    const tag = fakeTagEntry({ id: 'games', name: 'Games', aliases: [] });
    const card = fakeCardMeta({ tags: ['education'] });
    const result = getAvailableTagsForCards([card], [tag]);
    expect(result).toHaveLength(0);
  });

  it('getAvailableTagsForCards_sorted_by_count_desc', () => {
    const tagA = fakeTagEntry({ id: 'games', name: 'Games', aliases: [] });
    const tagB = fakeTagEntry({ id: 'education', name: 'Education', aliases: [] });
    const c1 = fakeCardMeta({ uid: 'p/1', tags: ['games'] });
    const c2 = fakeCardMeta({ uid: 'p/2', tags: ['games'] });
    const c3 = fakeCardMeta({ uid: 'p/3', tags: ['education'] });
    const result = getAvailableTagsForCards([c1, c2, c3], [tagA, tagB]);
    expect(result[0].id).toBe('games');
    expect(result[0].count).toBe(2);
    expect(result[1].id).toBe('education');
    expect(result[1].count).toBe(1);
  });
});

describe('filterCardsByTag', () => {
  it('filterCardsByTag_null_returns_all', () => {
    const cards = [fakeCardMeta({ uid: 'p/1' }), fakeCardMeta({ uid: 'p/2' })];
    expect(filterCardsByTag(cards, null)).toEqual(cards);
  });

  it('filterCardsByTag_filters_to_matching_tag', () => {
    const match = fakeCardMeta({ uid: 'p/1', tags: ['games'] });
    const noMatch = fakeCardMeta({ uid: 'p/2', tags: ['education'] });
    const result = filterCardsByTag([match, noMatch], 'games');
    expect(result).toEqual([match]);
  });
});
