import { describe, it, expect } from 'vitest';
import {
  canonicalFilterPairs,
  filterQueryString,
  filtersForKey,
  isIdentityParamKey,
  isLensUid,
  lensKey,
  lensNameForKey,
  sameFilters,
  splitLocationParams,
  uidForKey,
} from './lens-key';

describe('lensKey', () => {
  it('is the bare uid when nothing is selected', () => {
    expect(lensKey('interesting')).toBe('lens/interesting');
    expect(lensKey('interesting', [])).toBe('lens/interesting');
  });

  it('appends the filter set as a query', () => {
    expect(lensKey('interesting', [['filter.what', 'puzzles']]))
      .toBe('lens/interesting?filter.what=puzzles');
  });

  it('is canonically ordered, so two orderings of one selection agree', () => {
    // This is the load-bearing property: if two links selecting the same
    // filters produced different keys, "already in the stack" would silently
    // stop matching and every such link would push a duplicate.
    const a = lensKey('interesting', [['filter.what', 'puzzles'], ['filter.where', 'norway']]);
    const b = lensKey('interesting', [['filter.where', 'norway'], ['filter.what', 'puzzles']]);
    expect(a).toBe(b);
  });

  it('drops exact duplicate pairs', () => {
    expect(lensKey('x', [['filter.what', 'a'], ['filter.what', 'a']]))
      .toBe(lensKey('x', [['filter.what', 'a']]));
  });

  it('keeps distinct values of one key, sorted', () => {
    expect(lensKey('x', [['filter.what', 'puzzles'], ['filter.what', 'projects']]))
      .toBe('lens/x?filter.what=projects&filter.what=puzzles');
  });

  it('distinguishes two filter sets of the same lens', () => {
    expect(lensKey('interesting', [['filter.what', 'puzzles']]))
      .not.toBe(lensKey('interesting', [['filter.where', 'europe/norway']]));
  });

  it('percent-encodes values that need it, so the key survives as one token', () => {
    const key = lensKey('x', [['filter.where', 'europe/norway/svalbard']]);
    expect(key).toBe('lens/x?filter.where=europe%2Fnorway%2Fsvalbard');
    expect(filtersForKey(key)).toEqual([['filter.where', 'europe/norway/svalbard']]);
  });
});

describe('uidForKey / filtersForKey', () => {
  it('splits a filtered lens key back into its fetchable uid and its filters', () => {
    const key = lensKey('interesting', [['filter.what', 'puzzles']]);
    expect(uidForKey(key)).toBe('lens/interesting');
    expect(filtersForKey(key)).toEqual([['filter.what', 'puzzles']]);
  });

  it('leaves a card key alone', () => {
    expect(uidForKey('what/puzzles/foo')).toBe('what/puzzles/foo');
    expect(filtersForKey('what/puzzles/foo')).toEqual([]);
  });

  it('round-trips any filter set', () => {
    const filters: [string, string][] = [
      ['filter.what', 'projects'],
      ['filter.what', 'puzzles'],
      ['filter', 'interactive'],
    ];
    expect(filtersForKey(lensKey('n', filters))).toEqual(canonicalFilterPairs(filters));
  });
});

describe('lensNameForKey / isLensUid', () => {
  it('reads the lens id out of a filtered key', () => {
    expect(lensNameForKey('lens/interesting?filter.what=puzzles')).toBe('interesting');
    expect(lensNameForKey('lens/home')).toBe('home');
  });

  it('returns null for a card', () => {
    expect(lensNameForKey('what/puzzles/foo')).toBeNull();
    expect(isLensUid('what/puzzles/foo')).toBe(false);
    expect(isLensUid('lens/home')).toBe(true);
  });
});

describe('isIdentityParamKey', () => {
  it('claims the registered filter params', () => {
    // Folded from the URL-param provider registry, so a dimension does not have
    // to be listed here to be recognised.
    expect(isIdentityParamKey('filter.what')).toBe(true);
    expect(isIdentityParamKey('filter')).toBe(true);
  });

  it('leaves side state alone', () => {
    expect(isIdentityParamKey('tab')).toBe(false);
    expect(isIdentityParamKey('stack')).toBe(false);
  });
});

describe('splitLocationParams', () => {
  it('gives a lens its filters as identity and keeps the rest as side state', () => {
    const { identity, other } = splitLocationParams('lens/interesting', [
      ['filter.what', 'puzzles'],
      ['stack', 'a,b'],
    ]);
    expect(identity).toEqual([['filter.what', 'puzzles']]);
    expect(other).toEqual([['stack', 'a,b']]);
  });

  it('gives a card no identity params at all — its uid already names it', () => {
    const { identity, other } = splitLocationParams('posts/hello', [
      ['filter.what', 'puzzles'],
      ['tab', 'bio'],
    ]);
    expect(identity).toEqual([]);
    expect(other).toEqual([['filter.what', 'puzzles'], ['tab', 'bio']]);
  });
});

describe('sameFilters / filterQueryString', () => {
  it('compares filter sets as sets, not as sequences', () => {
    expect(sameFilters(
      [['filter.what', 'a'], ['filter.what', 'b']],
      [['filter.what', 'b'], ['filter.what', 'a'], ['filter.what', 'a']],
    )).toBe(true);
    expect(sameFilters([['filter.what', 'a']], [['filter.what', 'b']])).toBe(false);
  });

  it('is empty for an empty selection', () => {
    expect(filterQueryString([])).toBe('');
  });
});
