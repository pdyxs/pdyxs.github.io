import { describe, it, expect } from 'vitest';
import { buildBrowseUrl, resolvePinnedCards } from './frontpage';
import { fakeCardMeta } from '../test/fixtures';
import type { FilterState } from './filters';

// ---------------------------------------------------------------------------
// buildBrowseUrl
// ---------------------------------------------------------------------------

describe('buildBrowseUrl', () => {
  it('returns /browse with no params for an empty filter', () => {
    expect(buildBrowseUrl({ selections: {} })).toBe('/browse');
  });

  it('includes filter params for a single-dimension filter', () => {
    const url = buildBrowseUrl({ selections: { what: ['what:projects'] } });
    const parsed = new URL(url, 'http://x');
    expect(parsed.pathname).toBe('/browse');
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
