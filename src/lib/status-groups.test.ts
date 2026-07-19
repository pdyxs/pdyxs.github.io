import { describe, it, expect } from 'vitest';
import { groupCardsByStatus } from './status-groups';
import { applyFilters } from './filters';
import type { FilterState } from './filters';
import { fakeCardMeta } from '../test/fixtures';

describe('groupCardsByStatus', () => {
  it('groups a single draft card under the Drafts group', () => {
    const draft = fakeCardMeta({ uid: 'a', title: 'a', status: 'draft' });
    const groups = groupCardsByStatus([draft]);
    expect(groups).toEqual([
      { status: 'draft', label: 'Drafts', cards: [draft], count: 1 },
    ]);
  });

  it('orders groups Drafts, Scheduled, Unlisted, Archived regardless of input order', () => {
    const groups = groupCardsByStatus([
      fakeCardMeta({ uid: 'a', title: 'a', status: 'archived' }),
      fakeCardMeta({ uid: 'b', title: 'b', status: 'unlisted' }),
      fakeCardMeta({ uid: 'c', title: 'c', status: 'scheduled' }),
      fakeCardMeta({ uid: 'd', title: 'd', status: 'draft' }),
    ]);
    expect(groups.map(g => g.status)).toEqual(['draft', 'scheduled', 'unlisted', 'archived']);
    expect(groups.map(g => g.label)).toEqual(['Drafts', 'Scheduled', 'Unlisted', 'Archived']);
  });

  it('excludes published cards entirely', () => {
    const groups = groupCardsByStatus([
      fakeCardMeta({ uid: 'a', title: 'a', status: 'published' }),
      fakeCardMeta({ uid: 'b', title: 'b', status: 'draft' }),
    ]);
    expect(groups.map(g => g.status)).toEqual(['draft']);
    expect(groups.flatMap(g => g.cards).map(c => c.uid)).toEqual(['b']);
  });

  it('omits a group with no members', () => {
    const groups = groupCardsByStatus([fakeCardMeta({ uid: 'a', title: 'a', status: 'draft' })]);
    expect(groups.map(g => g.status)).not.toContain('scheduled');
    expect(groups.map(g => g.status)).not.toContain('unlisted');
    expect(groups.map(g => g.status)).not.toContain('archived');
  });

  it('counts reflect the number of cards in each group', () => {
    const groups = groupCardsByStatus([
      fakeCardMeta({ uid: 'a', title: 'a', status: 'draft' }),
      fakeCardMeta({ uid: 'b', title: 'b', status: 'draft' }),
      fakeCardMeta({ uid: 'c', title: 'c', status: 'draft' }),
      fakeCardMeta({ uid: 'd', title: 'd', status: 'archived' }),
    ]);
    const drafts = groups.find(g => g.status === 'draft');
    const archived = groups.find(g => g.status === 'archived');
    expect(drafts?.count).toBe(3);
    expect(archived?.count).toBe(1);
  });

  it("preserves each card's relative order within its group", () => {
    const groups = groupCardsByStatus([
      fakeCardMeta({ uid: 'z', title: 'z', status: 'draft' }),
      fakeCardMeta({ uid: 'a', title: 'a', status: 'draft' }),
    ]);
    expect(groups[0].cards.map(c => c.uid)).toEqual(['z', 'a']);
  });

  it('returns an empty array for an empty or all-published pool', () => {
    expect(groupCardsByStatus([])).toEqual([]);
    expect(groupCardsByStatus([fakeCardMeta({ uid: 'a', title: 'a', status: 'published' })])).toEqual([]);
  });

  it('a 5W filter narrows the grouped result (applyFilters composes with groupCardsByStatus)', () => {
    const pool = [
      fakeCardMeta({ uid: 'a', title: 'a', status: 'draft', tags: ['what:writing'] }),
      fakeCardMeta({ uid: 'b', title: 'b', status: 'draft', tags: ['what:puzzles'] }),
      fakeCardMeta({ uid: 'c', title: 'c', status: 'archived', tags: ['what:puzzles'] }),
    ];
    const filter: FilterState = { selections: { what: ['what:puzzles'] } };

    const unfiltered = groupCardsByStatus(pool);
    expect(unfiltered.find(g => g.status === 'draft')?.count).toBe(2);

    const narrowed = groupCardsByStatus(applyFilters(pool, filter));
    expect(narrowed.find(g => g.status === 'draft')?.count).toBe(1);
    expect(narrowed.find(g => g.status === 'draft')?.cards.map(c => c.uid)).toEqual(['b']);
    expect(narrowed.find(g => g.status === 'archived')?.count).toBe(1);
  });
});
