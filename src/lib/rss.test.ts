import { describe, it, expect } from 'vitest';
import { buildFeedItems } from './rss';
import { card } from '../test/card-fixtures';

describe('buildFeedItems', () => {
  it('includes a listed, dated card as a feed item', () => {
    const items = buildFeedItems([
      card({ uid: 'posts/a', title: 'A', description: 'desc', date: new Date('2026-01-01') }),
    ]);
    expect(items).toEqual([
      { title: 'A', description: 'desc', link: '/card/posts/a', pubDate: new Date('2026-01-01') },
    ]);
  });

  it('excludes a card whose visibility.listed is false (hidden-stage card)', () => {
    const items = buildFeedItems([
      card({ uid: 'posts/hidden', date: new Date('2026-01-01'), visibility: { listed: false, reachable: false } }),
    ]);
    expect(items).toEqual([]);
  });

  it('excludes a card with no date (nothing to sort a feed by)', () => {
    const items = buildFeedItems([card({ uid: 'posts/undated', date: undefined })]);
    expect(items).toEqual([]);
  });

  it('sorts items newest first', () => {
    const items = buildFeedItems([
      card({ uid: 'posts/old', title: 'Old', date: new Date('2020-01-01') }),
      card({ uid: 'posts/new', title: 'New', date: new Date('2026-01-01') }),
    ]);
    expect(items.map(i => i.title)).toEqual(['New', 'Old']);
  });
});
