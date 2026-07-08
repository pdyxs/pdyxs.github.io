import { describe, it, expect } from 'vitest';
import { parseCollectionLink } from './collection-link';
import { DEFAULT_BROWSE_LENS_ID } from './lens-registry';

// ---------------------------------------------------------------------------
// Bare collection links — now map to the `what:<name>` bucket every card in
// that collection inherits (tag-inheritance.ts's derivePathTags), landing on
// the browse lens instead of the retired /card/<collection> pages.
// ---------------------------------------------------------------------------

describe('parseCollectionLink — bare collection name', () => {
  it('maps "puzzles" to the what:puzzles browse-lens filter (replaces /card/puzzles)', () => {
    const result = parseCollectionLink('puzzles');
    expect(result.type).toBe('filter');
    const url = new URL(result.url, 'http://x');
    expect(url.pathname).toBe(`/lens/${DEFAULT_BROWSE_LENS_ID}`);
    expect(url.searchParams.getAll('filter.what')).toEqual(['puzzles']);
  });

  it('maps "posts" and "projects" the same way', () => {
    for (const [name, expected] of [
      ['posts', 'posts'],
      ['projects', 'projects'],
    ] as const) {
      const result = parseCollectionLink(name);
      expect(result.type).toBe('filter');
      const url = new URL(result.url, 'http://x');
      expect(url.searchParams.getAll('filter.what')).toEqual([expected]);
    }
  });
});

// ---------------------------------------------------------------------------
// ?tag= query links — legacy collection-view "browse by tag" hrefs, migrated
// to filter-expression form. The tag id arrives in slash-form
// ("what/projects/software-engineering") and must be translated to filter
// colon-form ("what:projects/software-engineering") via slashIdToFilterValue.
// ---------------------------------------------------------------------------

describe('parseCollectionLink — ?tag= query (slash-form id)', () => {
  it('translates a nested slash-form tag id to colon-form on the right dimension', () => {
    const result = parseCollectionLink('projects?tag=what/projects/software-engineering');
    expect(result.type).toBe('filter');
    const url = new URL(result.url, 'http://x');
    expect(url.pathname).toBe(`/lens/${DEFAULT_BROWSE_LENS_ID}`);
    expect(url.searchParams.getAll('filter.what')).toEqual(['projects/software-engineering']);
  });

  it('translates a top-level slash-form tag id', () => {
    const result = parseCollectionLink('posts?tag=what/topics/design');
    expect(result.type).toBe('filter');
    const url = new URL(result.url, 'http://x');
    expect(url.searchParams.getAll('filter.what')).toEqual(['topics/design']);
  });
});

// ---------------------------------------------------------------------------
// Filter expression links — dimension:value
// ---------------------------------------------------------------------------

describe('parseCollectionLink — filter expressions', () => {
  it('returns filter action for a what:value expression', () => {
    const result = parseCollectionLink('what:puzzles');
    expect(result.type).toBe('filter');
    const url = new URL(result.url, 'http://x');
    expect(url.searchParams.getAll('filter.what')).toEqual(['puzzles']);
  });

  it('returns filter action for a multi-segment expression: what:projects/games', () => {
    const result = parseCollectionLink('what:projects/games');
    expect(result.type).toBe('filter');
    const url = new URL(result.url, 'http://x');
    expect(url.searchParams.getAll('filter.what')).toEqual(['projects/games']);
  });

  it('returns filter action for a deeply nested expression: what:projects/games/puzzle', () => {
    const result = parseCollectionLink('what:projects/games/puzzle');
    expect(result.type).toBe('filter');
    const url = new URL(result.url, 'http://x');
    expect(url.searchParams.getAll('filter.what')).toEqual(['projects/games/puzzle']);
  });

  it('works for the who dimension', () => {
    const result = parseCollectionLink('who:paul');
    expect(result.type).toBe('filter');
    const url = new URL(result.url, 'http://x');
    expect(url.searchParams.getAll('filter.who')).toEqual(['paul']);
  });

  it('works for the when dimension', () => {
    const result = parseCollectionLink('when:2024');
    expect(result.type).toBe('filter');
    const url = new URL(result.url, 'http://x');
    expect(url.searchParams.getAll('filter.when')).toEqual(['2024']);
  });

  it('works for the where dimension', () => {
    const result = parseCollectionLink('where:australia');
    expect(result.type).toBe('filter');
    const url = new URL(result.url, 'http://x');
    expect(url.searchParams.getAll('filter.where')).toEqual(['australia']);
  });

  it('works for the why dimension', () => {
    const result = parseCollectionLink('why:creative');
    expect(result.type).toBe('filter');
    const url = new URL(result.url, 'http://x');
    expect(url.searchParams.getAll('filter.why')).toEqual(['creative']);
  });

  it('filter URL pathname is the default browse lens', () => {
    const result = parseCollectionLink('what:puzzles');
    const url = new URL(result.url, 'http://x');
    expect(url.pathname).toBe(`/lens/${DEFAULT_BROWSE_LENS_ID}`);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('parseCollectionLink — edge cases', () => {
  // "tag:" is a different protocol (see CardStack.svelte's separate
  // `a[href^="tag:"]` handler) — a `collection:tag:...` href never occurs in
  // real content, but must still resolve to *some* filter, never a dead end.
  it('never returns anything but a filter action — there is no dead branch left', () => {
    const result = parseCollectionLink('tag:my-tag');
    expect(result.type).toBe('filter');
    expect(() => new URL(result.url, 'http://x')).not.toThrow();
  });
});
