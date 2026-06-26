import { describe, it, expect } from 'vitest';
import { parseCollectionLink } from './collection-link';

// ---------------------------------------------------------------------------
// Plain collection links (existing behaviour — must not regress)
// ---------------------------------------------------------------------------

describe('parseCollectionLink — plain collection', () => {
  it('returns card action for a bare collection name', () => {
    const result = parseCollectionLink('posts');
    expect(result.type).toBe('card');
    if (result.type === 'card') {
      expect(result.uid).toBe('posts');
      expect(result.params).toBeUndefined();
    }
  });

  it('returns card action for other known collections', () => {
    for (const name of ['projects', 'puzzles', 'stories', 'work']) {
      const result = parseCollectionLink(name);
      expect(result.type).toBe('card');
      if (result.type === 'card') expect(result.uid).toBe(name);
    }
  });

  it('preserves query params as card params', () => {
    const result = parseCollectionLink('posts?tag=games');
    expect(result.type).toBe('card');
    if (result.type === 'card') {
      expect(result.uid).toBe('posts');
      expect(result.params).toEqual({ tag: 'games' });
    }
  });
});

// ---------------------------------------------------------------------------
// Filter expression links — dimension:value
// ---------------------------------------------------------------------------

describe('parseCollectionLink — filter expressions', () => {
  it('returns filter action for a what:value expression', () => {
    const result = parseCollectionLink('what:puzzles');
    expect(result.type).toBe('filter');
    if (result.type === 'filter') {
      const url = new URL(result.url, 'http://x');
      expect(url.searchParams.getAll('filter.what')).toEqual(['what:puzzles']);
    }
  });

  it('returns filter action for a multi-segment expression: what:projects/games', () => {
    const result = parseCollectionLink('what:projects/games');
    expect(result.type).toBe('filter');
    if (result.type === 'filter') {
      const url = new URL(result.url, 'http://x');
      expect(url.searchParams.getAll('filter.what')).toEqual(['what:projects/games']);
    }
  });

  it('returns filter action for a deeply nested expression: what:projects/games/puzzle', () => {
    const result = parseCollectionLink('what:projects/games/puzzle');
    expect(result.type).toBe('filter');
    if (result.type === 'filter') {
      const url = new URL(result.url, 'http://x');
      expect(url.searchParams.getAll('filter.what')).toEqual(['what:projects/games/puzzle']);
    }
  });

  it('works for the who dimension', () => {
    const result = parseCollectionLink('who:paul');
    expect(result.type).toBe('filter');
    if (result.type === 'filter') {
      const url = new URL(result.url, 'http://x');
      expect(url.searchParams.getAll('filter.who')).toEqual(['who:paul']);
    }
  });

  it('works for the when dimension', () => {
    const result = parseCollectionLink('when:2024');
    expect(result.type).toBe('filter');
    if (result.type === 'filter') {
      const url = new URL(result.url, 'http://x');
      expect(url.searchParams.getAll('filter.when')).toEqual(['when:2024']);
    }
  });

  it('works for the where dimension', () => {
    const result = parseCollectionLink('where:australia');
    expect(result.type).toBe('filter');
    if (result.type === 'filter') {
      const url = new URL(result.url, 'http://x');
      expect(url.searchParams.getAll('filter.where')).toEqual(['where:australia']);
    }
  });

  it('works for the why dimension', () => {
    const result = parseCollectionLink('why:creative');
    expect(result.type).toBe('filter');
    if (result.type === 'filter') {
      const url = new URL(result.url, 'http://x');
      expect(url.searchParams.getAll('filter.why')).toEqual(['why:creative']);
    }
  });

  it('filter URL pathname is / (homepage with filters)', () => {
    const result = parseCollectionLink('what:puzzles');
    if (result.type === 'filter') {
      const url = new URL(result.url, 'http://x');
      expect(url.pathname).toBe('/');
    }
  });
});

// ---------------------------------------------------------------------------
// Edge cases — unknown segments should not be treated as filter expressions
// ---------------------------------------------------------------------------

describe('parseCollectionLink — edge cases', () => {
  it('treats an unknown-dimension colon segment as a card uid', () => {
    // "tag:my-tag" is not a dimension, so it falls through to card action
    // (tag links use the `tag:` protocol, not `collection:`)
    const result = parseCollectionLink('tag:my-tag');
    expect(result.type).toBe('card');
    if (result.type === 'card') {
      expect(result.uid).toBe('tag:my-tag');
    }
  });
});
