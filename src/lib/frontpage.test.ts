import { describe, it, expect, beforeEach } from 'vitest';
import { buildBrowseUrl, resolvePinnedCards, resolveFrontPageSlots } from './frontpage';
import type { FrontPageConfig, SerialisedCardFull } from './frontpage';
import { fakeCardMeta } from '../test/fixtures';
import { clearViewState } from './card-view-state';
import type { FilterState } from './filters';
import { DEFAULT_BROWSE_LENS_ID } from './lens-registry';

// ---------------------------------------------------------------------------
// buildBrowseUrl
// ---------------------------------------------------------------------------

describe('buildBrowseUrl', () => {
  // Home (the sole acceptsFilters:false lens) can't render a filter, so
  // buildBrowseUrl always targets the fallback browse lens (issue #26) —
  // never bare `/`, which would silently drop the filter.
  it('routes to the default browse lens with no params for an empty filter', () => {
    expect(buildBrowseUrl({ selections: {} })).toBe(`/lens/${DEFAULT_BROWSE_LENS_ID}`);
  });

  it('includes filter params for a single-dimension filter', () => {
    const url = buildBrowseUrl({ selections: { what: ['what:projects'] } });
    const parsed = new URL(url, 'http://x');
    expect(parsed.pathname).toBe(`/lens/${DEFAULT_BROWSE_LENS_ID}`);
    expect(parsed.searchParams.getAll('filter.what')).toEqual(['what:projects']);
  });

  it('includes multiple values for the same dimension', () => {
    const filter: FilterState = { selections: { what: ['what:projects', 'what:games'] } };
    const url = buildBrowseUrl(filter);
    const parsed = new URL(url, 'http://x');
    expect(parsed.searchParams.getAll('filter.what')).toEqual(['what:projects', 'what:games']);
  });

  it('includes values from multiple dimensions', () => {
    const filter: FilterState = {
      selections: { what: ['what:projects'], who: ['who:pdyxs'] },
    };
    const url = buildBrowseUrl(filter);
    const parsed = new URL(url, 'http://x');
    expect(parsed.searchParams.getAll('filter.what')).toEqual(['what:projects']);
    expect(parsed.searchParams.getAll('filter.who')).toEqual(['who:pdyxs']);
  });
});

// ---------------------------------------------------------------------------
// resolvePinnedCards
// ---------------------------------------------------------------------------

describe('resolvePinnedCards', () => {
  it('returns card metas for known UIDs in the requested order', () => {
    const a = fakeCardMeta({ uid: 'posts/a' });
    const b = fakeCardMeta({ uid: 'posts/b' });
    const result = resolvePinnedCards(['posts/b', 'posts/a'], [a, b]);
    expect(result.map(c => c.uid)).toEqual(['posts/b', 'posts/a']);
  });

  it('drops unknown UIDs silently', () => {
    const a = fakeCardMeta({ uid: 'posts/a' });
    const result = resolvePinnedCards(['posts/a', 'posts/unknown'], [a]);
    expect(result.map(c => c.uid)).toEqual(['posts/a']);
  });

  it('returns empty array when no UIDs match', () => {
    const a = fakeCardMeta({ uid: 'posts/a' });
    const result = resolvePinnedCards(['posts/unknown'], [a]);
    expect(result).toEqual([]);
  });

  it('returns empty array when uid list is empty', () => {
    const a = fakeCardMeta({ uid: 'posts/a' });
    expect(resolvePinnedCards([], [a])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// resolveFrontPageSlots
// ---------------------------------------------------------------------------

function fakeSerialisedCard(overrides?: Partial<SerialisedCardFull>): SerialisedCardFull {
  return {
    uid: 'posts/a',
    title: 'A Post',
    date: null,
    tags: [],
    collection: 'posts',
    id: 'a',
    renderer: 'card',
    contentHash: 'hash:a',
    ...overrides,
  };
}

describe('resolveFrontPageSlots', () => {
  beforeEach(() => {
    clearViewState();
  });

  it('resolves a pinned slot to its known card, in slot order', () => {
    const config: FrontPageConfig = { slots: [{ type: 'pinned', uid: 'posts/about-me' }] };
    const cards = [fakeSerialisedCard({ uid: 'posts/about-me', title: 'About Me', description: 'bio' })];

    const { slots } = resolveFrontPageSlots(config, cards, new Date('2024-03-15T08:00:00Z'));

    expect(slots).toEqual([{ type: 'pinned', uid: 'posts/about-me', title: 'About Me', description: 'bio' }]);
  });

  it('drops a pinned slot whose uid matches no card', () => {
    const config: FrontPageConfig = { slots: [{ type: 'pinned', uid: 'posts/missing' }] };
    const { slots } = resolveFrontPageSlots(config, [], new Date('2024-03-15T08:00:00Z'));
    expect(slots).toEqual([]);
  });

  it('resolves a filter slot to a day-seeded pick among matching cards', () => {
    const config: FrontPageConfig = {
      slots: [{ type: 'filter', label: 'A Project', filter: { selections: { what: ['what:projects'] } } }],
    };
    const cards = [
      fakeSerialisedCard({ uid: 'projects/a', tags: ['what:projects'] }),
      fakeSerialisedCard({ uid: 'projects/b', tags: ['what:projects'] }),
    ];

    const { slots } = resolveFrontPageSlots(config, cards, new Date('2024-03-15T08:00:00Z'));

    expect(slots).toHaveLength(1);
    expect(slots[0].type).toBe('filter');
    expect(slots[0]).toMatchObject({ label: 'A Project', browseUrl: `/lens/${DEFAULT_BROWSE_LENS_ID}?filter.what=what%3Aprojects` });
    expect(['projects/a', 'projects/b']).toContain((slots[0] as any).card?.uid);
  });

  it('resolves a filter slot to null when no card matches', () => {
    const config: FrontPageConfig = {
      slots: [{ type: 'filter', label: 'A Project', filter: { selections: { what: ['what:projects'] } } }],
    };
    const { slots } = resolveFrontPageSlots(config, [], new Date('2024-03-15T08:00:00Z'));
    expect(slots).toEqual([{ type: 'filter', label: 'A Project', card: null, browseUrl: `/lens/${DEFAULT_BROWSE_LENS_ID}?filter.what=what%3Aprojects` }]);
  });

  it('reports the picked filter-slot card as displayed, without writing view-state itself', () => {
    const config: FrontPageConfig = {
      slots: [{ type: 'filter', label: 'A Project', filter: { selections: { what: ['what:projects'] } } }],
    };
    const cards = [fakeSerialisedCard({ uid: 'projects/a', tags: ['what:projects'], contentHash: 'hash:a' })];

    const { displayed } = resolveFrontPageSlots(config, cards, new Date('2024-03-15T08:00:00Z'));

    expect(displayed).toEqual([{ uid: 'projects/a', contentHash: 'hash:a' }]);
  });
});
