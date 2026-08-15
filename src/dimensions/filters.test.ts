import { describe, it, expect } from 'vitest';
import { isValidFilterValue } from '../lib/five-w';
import { applyFilters, countSelectedValueMatches, filterStateToParams, filterStateFromParams, filterUrlForTagValue, stripFilterParams } from './index';
import type { FilterState } from './index';
import { fakeCardMeta } from '../test/fixtures';
import { DEFAULT_BROWSE_LENS_ID } from '../lib/lens-registry';

// ---------------------------------------------------------------------------
// isValidFilterValue
// ---------------------------------------------------------------------------

describe('isValidFilterValue', () => {
  it('rejects bare dimension roots', () => {
    expect(isValidFilterValue('what')).toBe(false);
    expect(isValidFilterValue('when')).toBe(false);
    expect(isValidFilterValue('where')).toBe(false);
    expect(isValidFilterValue('who')).toBe(false);
    expect(isValidFilterValue('why')).toBe(false);
  });

  it('accepts dimension:value tags', () => {
    expect(isValidFilterValue('what:projects')).toBe(true);
    expect(isValidFilterValue('why:professional')).toBe(true);
    expect(isValidFilterValue('when:2023')).toBe(true);
    expect(isValidFilterValue('who:clients')).toBe(true);
    expect(isValidFilterValue('where:online')).toBe(true);
  });

  it('accepts multi-level hierarchical tags', () => {
    expect(isValidFilterValue('what:projects/games')).toBe(true);
    expect(isValidFilterValue('what:projects/games/puzzle')).toBe(true);
  });

  it('rejects unknown dimension prefixes', () => {
    expect(isValidFilterValue('unknown:value')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidFilterValue('')).toBe(false);
  });

  it('rejects dimension with empty value after colon', () => {
    expect(isValidFilterValue('what:')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyFilters — prefix matching
// ---------------------------------------------------------------------------

describe('applyFilters — prefix matching', () => {
  it('returns all cards when filterState has no selections', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what:projects'] }),
      fakeCardMeta({ uid: 'posts/b', tags: ['why:personal'] }),
    ];
    const state: FilterState = { };
    expect(applyFilters(cards, state)).toEqual(cards);
  });

  it('exact match: selecting what:projects returns card with that exact tag', () => {
    const match = fakeCardMeta({ uid: 'posts/a', tags: ['what:projects'] });
    const noMatch = fakeCardMeta({ uid: 'posts/b', tags: ['what:writing'] });
    const state: FilterState = { what: ['what:projects'] };
    expect(applyFilters([match, noMatch], state)).toEqual([match]);
  });

  it('prefix match: selecting what:projects returns card with what:projects/games', () => {
    const match = fakeCardMeta({ uid: 'posts/a', tags: ['what:projects/games'] });
    const noMatch = fakeCardMeta({ uid: 'posts/b', tags: ['what:writing'] });
    const state: FilterState = { what: ['what:projects'] };
    expect(applyFilters([match, noMatch], state)).toEqual([match]);
  });

  it('multi-level prefix: what:projects matches what:projects/games/puzzle', () => {
    const match = fakeCardMeta({ uid: 'posts/a', tags: ['what:projects/games/puzzle'] });
    const state: FilterState = { what: ['what:projects'] };
    expect(applyFilters([match], state)).toEqual([match]);
  });

  it('prefix does not partially match sibling: what:project does not match what:projects', () => {
    const noMatch = fakeCardMeta({ uid: 'posts/a', tags: ['what:projects'] });
    const state: FilterState = { what: ['what:project'] };
    // 'what:project' is a hypothetical different tag — it is NOT a prefix of 'what:projects'
    // because 'what:projects' does not equal 'what:project' and does not start with 'what:project/'
    expect(applyFilters([noMatch], state)).toEqual([]);
  });

  it('multiple selections in same dimension are OR-ed', () => {
    const a = fakeCardMeta({ uid: 'posts/a', tags: ['what:projects'] });
    const b = fakeCardMeta({ uid: 'posts/b', tags: ['what:writing'] });
    const c = fakeCardMeta({ uid: 'posts/c', tags: ['what:other'] });
    const state: FilterState = { what: ['what:projects', 'what:writing'] };
    expect(applyFilters([a, b, c], state)).toEqual([a, b]);
  });

  it('multiple dimensions are AND-ed', () => {
    const both = fakeCardMeta({ uid: 'posts/both', tags: ['what:projects', 'why:professional'] });
    const onlyWhat = fakeCardMeta({ uid: 'posts/a', tags: ['what:projects'] });
    const onlyWhy = fakeCardMeta({ uid: 'posts/b', tags: ['why:professional'] });
    const state: FilterState = {
      what: ['what:projects'],
        why: ['why:professional'],
    };
    expect(applyFilters([both, onlyWhat, onlyWhy], state)).toEqual([both]);
  });

  it('card with multiple tags matches if any tag satisfies the selection', () => {
    const match = fakeCardMeta({ uid: 'posts/a', tags: ['why:personal', 'what:projects'] });
    const state: FilterState = { what: ['what:projects'] };
    expect(applyFilters([match], state)).toEqual([match]);
  });

  it('a card-backed tag (another card\'s own path) does not prefix-match an ancestor filter', () => {
    // A blog post linking to a project card via a manual tag is not the
    // same as the post being filed under that project's category.
    const project = fakeCardMeta({ uid: 'what/projects/where-the-heart-is', tags: ['what:projects'] });
    const post = fakeCardMeta({ uid: 'what/writing/deciding-where-the-heart-is', tags: ['what:writing', 'what:projects/where-the-heart-is'] });
    const state: FilterState = { what: ['what:projects'] };
    expect(applyFilters([project, post], state)).toEqual([project]);
  });

  it('a card-backed tag does not prefix-match even when its target card is absent from the pool', () => {
    // The target card is a draft (or otherwise unlisted), so it never reaches
    // the browse pool. Deriving card-backed values from the pool alone would
    // fail open here and file the post under the ancestor category — hence
    // the explicit cardBackedValues argument, computed from the FULL card set.
    const post = fakeCardMeta({ uid: 'what/writing/deciding-where-the-heart-is', tags: ['what:writing', 'what:projects/where-the-heart-is'] });
    const state: FilterState = { what: ['what:projects'] };
    const allCardBackedValues = new Set(['what:projects/where-the-heart-is']);
    expect(applyFilters([post], state, allCardBackedValues)).toEqual([]);
  });

  it('a card-backed tag still matches when selected exactly', () => {
    const project = fakeCardMeta({ uid: 'what/projects/where-the-heart-is', tags: ['what:projects'] });
    const post = fakeCardMeta({ uid: 'what/writing/deciding-where-the-heart-is', tags: ['what:writing', 'what:projects/where-the-heart-is'] });
    const state: FilterState = { what: ['what:projects/where-the-heart-is'] };
    expect(applyFilters([project, post], state)).toEqual([post]);
  });
});

// ---------------------------------------------------------------------------
// applyFilters — when dimension
// ---------------------------------------------------------------------------

describe('applyFilters — when dimension', () => {
  it('when:tag prefix match works like other dimensions', () => {
    const match = fakeCardMeta({ uid: 'posts/a', tags: ['when:2023'] });
    const noMatch = fakeCardMeta({ uid: 'posts/b', tags: ['when:2022'] });
    const state: FilterState = { when: ['when:2023'] };
    expect(applyFilters([match, noMatch], state)).toEqual([match]);
  });
});

// ---------------------------------------------------------------------------
// URL round-trip
// ---------------------------------------------------------------------------

describe('filterStateToParams / filterStateFromParams round-trip', () => {
  it('empty state encodes to empty params and round-trips', () => {
    const state: FilterState = { };
    const params = filterStateToParams(state);
    expect([...params.entries()]).toHaveLength(0);
    const decoded = filterStateFromParams(params);
    expect(decoded).toEqual({});
  });

  it('single dimension selection round-trips', () => {
    const state: FilterState = { what: ['what:projects'] };
    const params = filterStateToParams(state);
    const decoded = filterStateFromParams(params);
    expect(decoded.what).toEqual(['what:projects']);
  });

  it('encodes values without the redundant dimension prefix (no %3A)', () => {
    const state: FilterState = { what: ['what:projects/games'], who: ['who:about'] };
    const params = filterStateToParams(state);
    expect(params.getAll('filter.what')).toEqual(['projects/games']);
    expect(params.getAll('filter.who')).toEqual(['about']);
    expect(params.toString()).not.toContain('%3A');
    // Internal state is still fully-qualified after the round-trip.
    expect(filterStateFromParams(params).what).toEqual(['what:projects/games']);
  });

  it('decodes legacy fully-qualified values for backward compatibility', () => {
    const params = new URLSearchParams('filter.what=what%3Aprojects/games');
    expect(filterStateFromParams(params).what).toEqual(['what:projects/games']);
  });

  it('multiple values in same dimension round-trip', () => {
    const state: FilterState = { what: ['what:projects', 'what:writing'] };
    const params = filterStateToParams(state);
    const decoded = filterStateFromParams(params);
    expect(decoded.what).toEqual(['what:projects', 'what:writing']);
  });

  it('multiple dimensions round-trip', () => {
    const state: FilterState = {
      what: ['what:projects'],
        why: ['why:professional'],
        who: ['who:clients'],
    };
    const params = filterStateToParams(state);
    const decoded = filterStateFromParams(params);
    expect(decoded.what).toEqual(['what:projects']);
    expect(decoded.why).toEqual(['why:professional']);
    expect(decoded.who).toEqual(['who:clients']);
  });

  it('status round-trips', () => {
    const state: FilterState = { status: 'draft' };
    const params = filterStateToParams(state);
    expect(params.get('filter.status')).toBe('draft');
    const decoded = filterStateFromParams(params);
    expect(decoded.status).toBe('draft');
  });

  it('invalid status values are silently dropped on decode', () => {
    const params = new URLSearchParams('status=not-a-real-status');
    expect(filterStateFromParams(params).status).toBeUndefined();
  });

  it('absent status decodes to undefined', () => {
    const params = new URLSearchParams();
    expect(filterStateFromParams(params).status).toBeUndefined();
  });

  it('invalid filter values in params are silently dropped on decode', () => {
    const params = new URLSearchParams();
    params.set('filter.what', ''); // empty sub-value — invalid
    params.append('filter.what', 'projects'); // valid → what:projects
    const decoded = filterStateFromParams(params);
    expect(decoded.what).toEqual(['what:projects']);
  });

  it('unknown params are ignored on decode', () => {
    const params = new URLSearchParams();
    params.set('random', 'value');
    params.set('filter.what', 'what:projects');
    const decoded = filterStateFromParams(params);
    expect(decoded.what).toEqual(['what:projects']);
    expect(decoded.why).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// stripFilterParams
// ---------------------------------------------------------------------------

describe('stripFilterParams', () => {
  it('removes dimension filter params', () => {
    const params = new URLSearchParams('filter.what=what%3Apuzzles&filter.who=who%3Aaccenture');
    expect(stripFilterParams(params).toString()).toBe('');
  });

  it('removes the status param', () => {
    const params = new URLSearchParams('filter.status=draft&stack=abc');
    expect(stripFilterParams(params).toString()).toBe('stack=abc');
  });

  it('leaves unrelated params untouched', () => {
    const params = new URLSearchParams('filter.what=what%3Apuzzles&stack=abc');
    expect(stripFilterParams(params).toString()).toBe('stack=abc');
  });

  it('does not mutate the input', () => {
    const params = new URLSearchParams('filter.what=what%3Apuzzles');
    stripFilterParams(params);
    expect(params.toString()).toBe('filter.what=what%3Apuzzles');
  });
});

// ---------------------------------------------------------------------------
// filterUrlForTagValue
// ---------------------------------------------------------------------------

describe('filterUrlForTagValue', () => {
  // /card/filter is retired (issue #26) — tag chips now push the fallback
  // browse lens (DEFAULT_BROWSE_LENS_ID), same as buildBrowseUrl.
  it('builds a browse-lens URL pre-selecting the tag value on its dimension', () => {
    const url = filterUrlForTagValue('who:about');
    const parsed = new URL(url, 'http://x');
    expect(parsed.pathname).toBe(`/lens/${DEFAULT_BROWSE_LENS_ID}`);
    expect(parsed.searchParams.getAll('filter.who')).toEqual(['about']);
  });

  it('preserves nested tag values', () => {
    const url = filterUrlForTagValue('what:projects/games');
    const parsed = new URL(url, 'http://x');
    expect(parsed.searchParams.getAll('filter.what')).toEqual(['projects/games']);
  });

  it('builds a dimensionless filter URL for a value with no dimension prefix', () => {
    const url = filterUrlForTagValue('gamedev');
    const parsed = new URL(url, 'http://x');
    expect(parsed.pathname).toBe(`/lens/${DEFAULT_BROWSE_LENS_ID}`);
    expect(parsed.searchParams.getAll('filter')).toEqual(['gamedev']);
    expect(parsed.searchParams.getAll('filter.what')).toEqual([]);
  });

  it('returns the bare browse-lens URL for an unrecognised dimension prefix', () => {
    expect(filterUrlForTagValue('bogus:value')).toBe(`/lens/${DEFAULT_BROWSE_LENS_ID}`);
  });
});

// ---------------------------------------------------------------------------
// Dimensionless filters
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// applyFilters — status facet (dev-only filter panel, issue #52)
// ---------------------------------------------------------------------------

describe('applyFilters — status', () => {
  it('narrows to cards matching the selected status', () => {
    const draft = fakeCardMeta({ uid: 'posts/a', status: 'draft' });
    const published = fakeCardMeta({ uid: 'posts/b', status: 'published' });
    const state: FilterState = { status: 'draft' };
    expect(applyFilters([draft, published], state)).toEqual([draft]);
  });

  it('returns all cards when no status is selected', () => {
    const draft = fakeCardMeta({ uid: 'posts/a', status: 'draft' });
    const published = fakeCardMeta({ uid: 'posts/b', status: 'published' });
    const state: FilterState = { };
    expect(applyFilters([draft, published], state)).toEqual([draft, published]);
  });

  it('composes (ANDs) with an active 5W dimension selection', () => {
    const match = fakeCardMeta({ uid: 'posts/a', status: 'draft', tags: ['what:games'] });
    const wrongStatus = fakeCardMeta({ uid: 'posts/b', status: 'published', tags: ['what:games'] });
    const wrongTag = fakeCardMeta({ uid: 'posts/c', status: 'draft', tags: ['what:writing'] });
    const state: FilterState = { what: ['what:games'], status: 'draft' };
    expect(applyFilters([match, wrongStatus, wrongTag], state)).toEqual([match]);
  });
});

describe('applyFilters — dimensionless tags', () => {
  it('matches cards carrying an exactly-equal dimensionless tag', () => {
    const match = fakeCardMeta({ uid: 'posts/a', tags: ['what:art', 'science'] });
    const noMatch = fakeCardMeta({ uid: 'posts/b', tags: ['what:art'] });
    const state: FilterState = { '': ['science'] };
    expect(applyFilters([match, noMatch], state)).toEqual([match]);
  });

  it('does not prefix-match dimensionless tags', () => {
    const noMatch = fakeCardMeta({ uid: 'posts/a', tags: ['science-fiction'] });
    const state: FilterState = { '': ['science'] };
    expect(applyFilters([noMatch], state)).toEqual([]);
  });

  it('multiple dimensionless tags are OR-ed within the bucket', () => {
    const a = fakeCardMeta({ uid: 'posts/a', tags: ['science'] });
    const b = fakeCardMeta({ uid: 'posts/b', tags: ['education'] });
    const c = fakeCardMeta({ uid: 'posts/c', tags: ['unrelated'] });
    const state: FilterState = { '': ['science', 'education'] };
    expect(applyFilters([a, b, c], state)).toEqual([a, b]);
  });

  it('dimensionless bucket AND-s with dimension selections', () => {
    const both = fakeCardMeta({ uid: 'posts/both', tags: ['what:art', 'science'] });
    const onlyDim = fakeCardMeta({ uid: 'posts/a', tags: ['what:art'] });
    const onlyTag = fakeCardMeta({ uid: 'posts/b', tags: ['science'] });
    const state: FilterState = { what: ['what:art'], '': ['science'] };
    expect(applyFilters([both, onlyDim, onlyTag], state)).toEqual([both]);
  });
});

describe('dimensionless filter URL round-trip', () => {
  it('encodes a dimensionless filter as a bare `filter` param', () => {
    const state: FilterState = { '': ['science'] };
    const params = filterStateToParams(state);
    expect(params.getAll('filter')).toEqual(['science']);
    expect(params.toString()).not.toContain('%3A');
  });

  it('round-trips dimensionless tags alongside dimension selections', () => {
    const state: FilterState = { what: ['what:art'], '': ['science', 'education'] };
    const decoded = filterStateFromParams(filterStateToParams(state));
    expect(decoded.what).toEqual(['what:art']);
    expect(decoded['']).toEqual(['science', 'education']);
  });

  it('drops invalid dimensionless values (empty or containing a colon) on decode', () => {
    const params = new URLSearchParams();
    params.append('filter', '');
    params.append('filter', 'what:art');
    params.append('filter', 'science');
    expect(filterStateFromParams(params)['']).toEqual(['science']);
  });

  it('stripFilterParams removes the bare filter param', () => {
    const params = new URLSearchParams('filter=science&stack=abc');
    expect(stripFilterParams(params).toString()).toBe('stack=abc');
  });
});

// ---------------------------------------------------------------------------
// countSelectedValueMatches — rung 1 of the ranking chain (issue #80)
// ---------------------------------------------------------------------------

describe('countSelectedValueMatches', () => {
  const ctx = { cardBackedValues: new Set<string>() };

  it('is zero when nothing is selected, so rung 1 is a no-op on an unfiltered pool', () => {
    const card = fakeCardMeta({ tags: ['what:games', 'what:art'] });
    expect(countSelectedValueMatches(card, {}, ctx)).toBe(0);
  });

  it('counts each selected value the card matches, not just "did it match"', () => {
    // applyFilters can't answer this: values within one dimension OR, so its
    // `matches` collapses both of these into the same `true`.
    const both = fakeCardMeta({ uid: 'a', tags: ['what:games', 'what:art'] });
    const one = fakeCardMeta({ uid: 'b', tags: ['what:games'] });
    const state = { what: ['what:games', 'what:art'] };
    expect(countSelectedValueMatches(both, state, ctx)).toBe(2);
    expect(countSelectedValueMatches(one, state, ctx)).toBe(1);
  });

  it('counts across dimensions as well as within one', () => {
    const card = fakeCardMeta({ tags: ['what:games', 'where:work/seethrough'] });
    const state = { what: ['what:games'], where: ['where:work/seethrough'] };
    expect(countSelectedValueMatches(card, state, ctx)).toBe(2);
  });

  it('counts a value the card matches by prefix', () => {
    const card = fakeCardMeta({ tags: ['what:games/digital'] });
    expect(countSelectedValueMatches(card, { what: ['what:games'] }, ctx)).toBe(1);
  });

  it('counts dimensionless tags too', () => {
    const card = fakeCardMeta({ tags: ['interactive'] });
    expect(countSelectedValueMatches(card, { '': ['interactive'] }, ctx)).toBe(1);
  });
});
