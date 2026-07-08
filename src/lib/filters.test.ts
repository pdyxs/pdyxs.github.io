import { describe, it, expect } from 'vitest';
import {
  isValidFilterValue,
  applyFilters,
  filterStateToParams,
  filterStateFromParams,
  filterUrlForTagValue,
  stripFilterParams,
} from './filters';
import type { FilterState } from './filters';
import { fakeCardMeta } from '../test/fixtures';
import { DEFAULT_BROWSE_LENS_ID } from './lens-registry';

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
    const state: FilterState = { selections: {} };
    expect(applyFilters(cards, state)).toEqual(cards);
  });

  it('exact match: selecting what:projects returns card with that exact tag', () => {
    const match = fakeCardMeta({ uid: 'posts/a', tags: ['what:projects'] });
    const noMatch = fakeCardMeta({ uid: 'posts/b', tags: ['what:writing'] });
    const state: FilterState = { selections: { what: ['what:projects'] } };
    expect(applyFilters([match, noMatch], state)).toEqual([match]);
  });

  it('prefix match: selecting what:projects returns card with what:projects/games', () => {
    const match = fakeCardMeta({ uid: 'posts/a', tags: ['what:projects/games'] });
    const noMatch = fakeCardMeta({ uid: 'posts/b', tags: ['what:writing'] });
    const state: FilterState = { selections: { what: ['what:projects'] } };
    expect(applyFilters([match, noMatch], state)).toEqual([match]);
  });

  it('multi-level prefix: what:projects matches what:projects/games/puzzle', () => {
    const match = fakeCardMeta({ uid: 'posts/a', tags: ['what:projects/games/puzzle'] });
    const state: FilterState = { selections: { what: ['what:projects'] } };
    expect(applyFilters([match], state)).toEqual([match]);
  });

  it('prefix does not partially match sibling: what:project does not match what:projects', () => {
    const noMatch = fakeCardMeta({ uid: 'posts/a', tags: ['what:projects'] });
    const state: FilterState = { selections: { what: ['what:project'] } };
    // 'what:project' is a hypothetical different tag — it is NOT a prefix of 'what:projects'
    // because 'what:projects' does not equal 'what:project' and does not start with 'what:project/'
    expect(applyFilters([noMatch], state)).toEqual([]);
  });

  it('multiple selections in same dimension are OR-ed', () => {
    const a = fakeCardMeta({ uid: 'posts/a', tags: ['what:projects'] });
    const b = fakeCardMeta({ uid: 'posts/b', tags: ['what:writing'] });
    const c = fakeCardMeta({ uid: 'posts/c', tags: ['what:other'] });
    const state: FilterState = { selections: { what: ['what:projects', 'what:writing'] } };
    expect(applyFilters([a, b, c], state)).toEqual([a, b]);
  });

  it('multiple dimensions are AND-ed', () => {
    const both = fakeCardMeta({ uid: 'posts/both', tags: ['what:projects', 'why:professional'] });
    const onlyWhat = fakeCardMeta({ uid: 'posts/a', tags: ['what:projects'] });
    const onlyWhy = fakeCardMeta({ uid: 'posts/b', tags: ['why:professional'] });
    const state: FilterState = {
      selections: {
        what: ['what:projects'],
        why: ['why:professional'],
      },
    };
    expect(applyFilters([both, onlyWhat, onlyWhy], state)).toEqual([both]);
  });

  it('card with multiple tags matches if any tag satisfies the selection', () => {
    const match = fakeCardMeta({ uid: 'posts/a', tags: ['why:personal', 'what:projects'] });
    const state: FilterState = { selections: { what: ['what:projects'] } };
    expect(applyFilters([match], state)).toEqual([match]);
  });

  it('a card-backed tag (another card\'s own path) does not prefix-match an ancestor filter', () => {
    // A blog post linking to a project card via a manual tag is not the
    // same as the post being filed under that project's category.
    const project = fakeCardMeta({ uid: 'what/projects/where-the-heart-is', tags: ['what:projects'] });
    const post = fakeCardMeta({ uid: 'what/writing/deciding-where-the-heart-is', tags: ['what:writing', 'what:projects/where-the-heart-is'] });
    const state: FilterState = { selections: { what: ['what:projects'] } };
    expect(applyFilters([project, post], state)).toEqual([project]);
  });

  it('a card-backed tag still matches when selected exactly', () => {
    const project = fakeCardMeta({ uid: 'what/projects/where-the-heart-is', tags: ['what:projects'] });
    const post = fakeCardMeta({ uid: 'what/writing/deciding-where-the-heart-is', tags: ['what:writing', 'what:projects/where-the-heart-is'] });
    const state: FilterState = { selections: { what: ['what:projects/where-the-heart-is'] } };
    expect(applyFilters([project, post], state)).toEqual([post]);
  });
});

// ---------------------------------------------------------------------------
// applyFilters — when dimension with date predicates
// ---------------------------------------------------------------------------

describe('applyFilters — when dimension date predicates', () => {
  it('when:tag prefix match works like other dimensions', () => {
    const match = fakeCardMeta({ uid: 'posts/a', tags: ['when:2023'] });
    const noMatch = fakeCardMeta({ uid: 'posts/b', tags: ['when:2022'] });
    const state: FilterState = { selections: { when: ['when:2023'] } };
    expect(applyFilters([match, noMatch], state)).toEqual([match]);
  });

  it('date predicate alone filters by date range (no when tag selection)', () => {
    const inRange = fakeCardMeta({
      uid: 'posts/a',
      date: new Date('2023-06-01'),
      tags: [],
    });
    const outRange = fakeCardMeta({
      uid: 'posts/b',
      date: new Date('2022-01-01'),
      tags: [],
    });
    const noDate = fakeCardMeta({ uid: 'posts/c', tags: [] });
    const state: FilterState = {
      selections: {},
      datePredicate: { from: new Date('2023-01-01'), to: new Date('2023-12-31') },
    };
    // inRange matches; outRange and noDate do not
    expect(applyFilters([inRange, outRange, noDate], state)).toEqual([inRange]);
  });

  it('when tag selection OR date predicate: either can match', () => {
    const tagMatch = fakeCardMeta({ uid: 'posts/a', tags: ['when:2020s'] });
    const dateMatch = fakeCardMeta({
      uid: 'posts/b',
      date: new Date('2023-06-01'),
      tags: [],
    });
    const noMatch = fakeCardMeta({ uid: 'posts/c', tags: ['when:2010s'] });
    const state: FilterState = {
      selections: { when: ['when:2020s'] },
      datePredicate: { from: new Date('2023-01-01'), to: new Date('2023-12-31') },
    };
    const result = applyFilters([tagMatch, dateMatch, noMatch], state);
    expect(result).toContain(tagMatch);
    expect(result).toContain(dateMatch);
    expect(result).not.toContain(noMatch);
  });

  it('date predicate from only: matches cards on or after the from date', () => {
    const match = fakeCardMeta({ uid: 'posts/a', date: new Date('2023-01-01'), tags: [] });
    const noMatch = fakeCardMeta({ uid: 'posts/b', date: new Date('2022-12-31'), tags: [] });
    const state: FilterState = {
      selections: {},
      datePredicate: { from: new Date('2023-01-01') },
    };
    expect(applyFilters([match, noMatch], state)).toEqual([match]);
  });

  it('date predicate to only: matches cards on or before the to date', () => {
    const match = fakeCardMeta({ uid: 'posts/a', date: new Date('2022-12-31'), tags: [] });
    const noMatch = fakeCardMeta({ uid: 'posts/b', date: new Date('2023-01-01'), tags: [] });
    const state: FilterState = {
      selections: {},
      datePredicate: { to: new Date('2022-12-31') },
    };
    expect(applyFilters([match, noMatch], state)).toEqual([match]);
  });

  it('combined: what selection AND date predicate both must be satisfied', () => {
    const both = fakeCardMeta({
      uid: 'posts/both',
      date: new Date('2023-06-01'),
      tags: ['what:projects'],
    });
    const wrongTag = fakeCardMeta({
      uid: 'posts/a',
      date: new Date('2023-06-01'),
      tags: ['what:writing'],
    });
    const wrongDate = fakeCardMeta({
      uid: 'posts/b',
      date: new Date('2021-01-01'),
      tags: ['what:projects'],
    });
    const state: FilterState = {
      selections: { what: ['what:projects'] },
      datePredicate: { from: new Date('2023-01-01'), to: new Date('2023-12-31') },
    };
    expect(applyFilters([both, wrongTag, wrongDate], state)).toEqual([both]);
  });
});

// ---------------------------------------------------------------------------
// URL round-trip
// ---------------------------------------------------------------------------

describe('filterStateToParams / filterStateFromParams round-trip', () => {
  it('empty state encodes to empty params and round-trips', () => {
    const state: FilterState = { selections: {} };
    const params = filterStateToParams(state);
    expect([...params.entries()]).toHaveLength(0);
    const decoded = filterStateFromParams(params);
    expect(decoded.selections).toEqual({});
    expect(decoded.datePredicate).toBeUndefined();
  });

  it('single dimension selection round-trips', () => {
    const state: FilterState = { selections: { what: ['what:projects'] } };
    const params = filterStateToParams(state);
    const decoded = filterStateFromParams(params);
    expect(decoded.selections.what).toEqual(['what:projects']);
  });

  it('encodes values without the redundant dimension prefix (no %3A)', () => {
    const state: FilterState = { selections: { what: ['what:projects/games'], who: ['who:about'] } };
    const params = filterStateToParams(state);
    expect(params.getAll('filter.what')).toEqual(['projects/games']);
    expect(params.getAll('filter.who')).toEqual(['about']);
    expect(params.toString()).not.toContain('%3A');
    // Internal state is still fully-qualified after the round-trip.
    expect(filterStateFromParams(params).selections.what).toEqual(['what:projects/games']);
  });

  it('decodes legacy fully-qualified values for backward compatibility', () => {
    const params = new URLSearchParams('filter.what=what%3Aprojects/games');
    expect(filterStateFromParams(params).selections.what).toEqual(['what:projects/games']);
  });

  it('multiple values in same dimension round-trip', () => {
    const state: FilterState = { selections: { what: ['what:projects', 'what:writing'] } };
    const params = filterStateToParams(state);
    const decoded = filterStateFromParams(params);
    expect(decoded.selections.what).toEqual(['what:projects', 'what:writing']);
  });

  it('multiple dimensions round-trip', () => {
    const state: FilterState = {
      selections: {
        what: ['what:projects'],
        why: ['why:professional'],
        who: ['who:clients'],
      },
    };
    const params = filterStateToParams(state);
    const decoded = filterStateFromParams(params);
    expect(decoded.selections.what).toEqual(['what:projects']);
    expect(decoded.selections.why).toEqual(['why:professional']);
    expect(decoded.selections.who).toEqual(['who:clients']);
  });

  it('date predicate round-trips', () => {
    const from = new Date('2023-01-01T00:00:00.000Z');
    const to = new Date('2023-12-31T23:59:59.999Z');
    const state: FilterState = {
      selections: {},
      datePredicate: { from, to },
    };
    const params = filterStateToParams(state);
    const decoded = filterStateFromParams(params);
    expect(decoded.datePredicate?.from?.toISOString()).toBe(from.toISOString());
    expect(decoded.datePredicate?.to?.toISOString()).toBe(to.toISOString());
  });

  it('date predicate from only round-trips', () => {
    const from = new Date('2020-06-15T00:00:00.000Z');
    const state: FilterState = { selections: {}, datePredicate: { from } };
    const params = filterStateToParams(state);
    const decoded = filterStateFromParams(params);
    expect(decoded.datePredicate?.from?.toISOString()).toBe(from.toISOString());
    expect(decoded.datePredicate?.to).toBeUndefined();
  });

  it('full state round-trips: selections + date predicate', () => {
    const from = new Date('2022-01-01T00:00:00.000Z');
    const to = new Date('2022-12-31T23:59:59.999Z');
    const state: FilterState = {
      selections: {
        what: ['what:projects/games'],
        why: ['why:professional'],
        when: ['when:2020s'],
      },
      datePredicate: { from, to },
    };
    const params = filterStateToParams(state);
    const decoded = filterStateFromParams(params);
    expect(decoded.selections.what).toEqual(['what:projects/games']);
    expect(decoded.selections.why).toEqual(['why:professional']);
    expect(decoded.selections.when).toEqual(['when:2020s']);
    expect(decoded.datePredicate?.from?.toISOString()).toBe(from.toISOString());
    expect(decoded.datePredicate?.to?.toISOString()).toBe(to.toISOString());
  });

  it('invalid filter values in params are silently dropped on decode', () => {
    const params = new URLSearchParams();
    params.set('filter.what', ''); // empty sub-value — invalid
    params.append('filter.what', 'projects'); // valid → what:projects
    const decoded = filterStateFromParams(params);
    expect(decoded.selections.what).toEqual(['what:projects']);
  });

  it('unknown params are ignored on decode', () => {
    const params = new URLSearchParams();
    params.set('random', 'value');
    params.set('filter.what', 'what:projects');
    const decoded = filterStateFromParams(params);
    expect(decoded.selections.what).toEqual(['what:projects']);
    expect(decoded.selections.why).toBeUndefined();
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

  it('removes date predicate params', () => {
    const params = new URLSearchParams('when.from=2020-01-01T00:00:00.000Z&when.to=2020-12-31T00:00:00.000Z');
    expect(stripFilterParams(params).toString()).toBe('');
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

  it('returns the bare browse-lens URL for a value with no dimension prefix', () => {
    expect(filterUrlForTagValue('gamedev')).toBe(`/lens/${DEFAULT_BROWSE_LENS_ID}`);
  });

  it('returns the bare browse-lens URL for an unrecognised dimension prefix', () => {
    expect(filterUrlForTagValue('bogus:value')).toBe(`/lens/${DEFAULT_BROWSE_LENS_ID}`);
  });
});
