import { describe, it, expect } from 'vitest';
import {
  extractDimensionTags,
  countMatchingCards,
  buildTagHierarchy,
  buildAllDimensionHierarchies,
  dimensionHasTags,
} from './browse-helpers';
import type { TagNode } from './browse-helpers';
import { fakeCardMeta } from '../test/fixtures';

// ---------------------------------------------------------------------------
// extractDimensionTags
// ---------------------------------------------------------------------------

describe('extractDimensionTags', () => {
  it('returns empty array when no cards have tags for the dimension', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['why:professional'] }),
      fakeCardMeta({ uid: 'posts/b', tags: [] }),
    ];
    expect(extractDimensionTags(cards, 'what')).toEqual([]);
  });

  it('returns unique tags for the given dimension', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what:projects', 'why:professional'] }),
      fakeCardMeta({ uid: 'posts/b', tags: ['what:projects', 'what:writing'] }),
    ];
    const result = extractDimensionTags(cards, 'what');
    expect(result).toContain('what:projects');
    expect(result).toContain('what:writing');
    expect(result).toHaveLength(2);
  });

  it('does not include bare dimension root tags (would not pass isValidFilterValue)', () => {
    // Bare roots like "what" without a colon are not valid filter values
    // If a card mistakenly has tag "what" (no colon), it must be excluded
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what'] }),
    ];
    expect(extractDimensionTags(cards, 'what')).toEqual([]);
  });

  it('includes multi-level hierarchical tags', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what:projects/games'] }),
      fakeCardMeta({ uid: 'posts/b', tags: ['what:projects/games/puzzle'] }),
    ];
    const result = extractDimensionTags(cards, 'what');
    expect(result).toContain('what:projects/games');
    expect(result).toContain('what:projects/games/puzzle');
  });

  it('excludes tags from other dimensions', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what:projects', 'why:professional', 'when:2023'] }),
    ];
    const result = extractDimensionTags(cards, 'why');
    expect(result).toEqual(['why:professional']);
  });

  it('returns sorted results', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what:writing', 'what:projects', 'what:art'] }),
    ];
    const result = extractDimensionTags(cards, 'what');
    expect(result).toEqual(['what:art', 'what:projects', 'what:writing']);
  });
});

// ---------------------------------------------------------------------------
// countMatchingCards
// ---------------------------------------------------------------------------

describe('countMatchingCards', () => {
  it('counts cards with exact tag match', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what:projects'] }),
      fakeCardMeta({ uid: 'posts/b', tags: ['what:writing'] }),
      fakeCardMeta({ uid: 'posts/c', tags: ['why:professional'] }),
    ];
    expect(countMatchingCards(cards, 'what:projects')).toBe(1);
  });

  it('counts cards with prefix match (child tags)', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what:projects'] }),
      fakeCardMeta({ uid: 'posts/b', tags: ['what:projects/games'] }),
      fakeCardMeta({ uid: 'posts/c', tags: ['what:projects/games/puzzle'] }),
      fakeCardMeta({ uid: 'posts/d', tags: ['what:writing'] }),
    ];
    // 'what:projects' matches posts/a (exact), posts/b (prefix), posts/c (prefix)
    expect(countMatchingCards(cards, 'what:projects')).toBe(3);
  });

  it('does not count cards with sibling prefix', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what:project'] }),  // similar but NOT a child
      fakeCardMeta({ uid: 'posts/b', tags: ['what:projects'] }), // exact match
    ];
    // 'what:project' should not match 'what:projects'
    expect(countMatchingCards(cards, 'what:project')).toBe(1); // only posts/a
  });

  it('returns 0 when no cards match', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what:writing'] }),
    ];
    expect(countMatchingCards(cards, 'what:projects')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildTagHierarchy
// ---------------------------------------------------------------------------

describe('buildTagHierarchy', () => {
  it('returns empty array when no cards have tags for the dimension', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['why:professional'] }),
    ];
    expect(buildTagHierarchy(cards, 'what')).toEqual([]);
  });

  it('returns flat list for tags with no hierarchy', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what:projects'] }),
      fakeCardMeta({ uid: 'posts/b', tags: ['what:writing'] }),
    ];
    const tree = buildTagHierarchy(cards, 'what');
    expect(tree).toHaveLength(2);
    expect(tree.map(n => n.value)).toContain('what:projects');
    expect(tree.map(n => n.value)).toContain('what:writing');
    // No children at root
    tree.forEach(n => expect(n.children).toHaveLength(0));
  });

  it('nests children under their parents', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what:projects'] }),
      fakeCardMeta({ uid: 'posts/b', tags: ['what:projects/games'] }),
      fakeCardMeta({ uid: 'posts/c', tags: ['what:projects/writing'] }),
    ];
    const tree = buildTagHierarchy(cards, 'what');
    expect(tree).toHaveLength(1);
    const root = tree[0];
    expect(root.value).toBe('what:projects');
    expect(root.children).toHaveLength(2);
    const childValues = root.children.map(c => c.value);
    expect(childValues).toContain('what:projects/games');
    expect(childValues).toContain('what:projects/writing');
  });

  it('creates multi-level nesting for deeply nested tags', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what:projects'] }),
      fakeCardMeta({ uid: 'posts/b', tags: ['what:projects/games'] }),
      fakeCardMeta({ uid: 'posts/c', tags: ['what:projects/games/puzzle'] }),
    ];
    const tree = buildTagHierarchy(cards, 'what');
    expect(tree).toHaveLength(1);
    const root = tree[0];
    expect(root.value).toBe('what:projects');
    expect(root.children).toHaveLength(1);
    const mid = root.children[0];
    expect(mid.value).toBe('what:projects/games');
    expect(mid.children).toHaveLength(1);
    expect(mid.children[0].value).toBe('what:projects/games/puzzle');
    expect(mid.children[0].children).toHaveLength(0);
  });

  it('uses the last path segment as the label', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what:projects'] }),
      fakeCardMeta({ uid: 'posts/b', tags: ['what:projects/games'] }),
    ];
    const tree = buildTagHierarchy(cards, 'what');
    expect(tree[0].label).toBe('projects');
    expect(tree[0].children[0].label).toBe('games');
  });

  it('sets count to number of cards matching via prefix', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what:projects'] }),
      fakeCardMeta({ uid: 'posts/b', tags: ['what:projects/games'] }),
      fakeCardMeta({ uid: 'posts/c', tags: ['what:projects/writing'] }),
    ];
    const tree = buildTagHierarchy(cards, 'what');
    // 'what:projects' prefix-matches all 3
    expect(tree[0].count).toBe(3);
    // 'what:projects/games' matches only posts/b
    const gamesNode = tree[0].children.find(c => c.value === 'what:projects/games');
    expect(gamesNode!.count).toBe(1);
  });

  it('sorts children alphabetically by label', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what:projects/writing'] }),
      fakeCardMeta({ uid: 'posts/b', tags: ['what:projects/games'] }),
      fakeCardMeta({ uid: 'posts/c', tags: ['what:projects/art'] }),
      fakeCardMeta({ uid: 'posts/d', tags: ['what:projects'] }),
    ];
    const tree = buildTagHierarchy(cards, 'what');
    const labels = tree[0].children.map(c => c.label);
    expect(labels).toEqual(['art', 'games', 'writing']);
  });

  it('handles orphaned child tags (no explicit parent tag) as roots', () => {
    // Only 'what:projects/games' exists, no 'what:projects' tag
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what:projects/games'] }),
    ];
    const tree = buildTagHierarchy(cards, 'what');
    // Should appear as a root (no parent to nest under)
    expect(tree).toHaveLength(1);
    expect(tree[0].value).toBe('what:projects/games');
  });

  it('bare dimension root tag "what" is not included as a node', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what'] }), // invalid as filter value
      fakeCardMeta({ uid: 'posts/b', tags: ['what:projects'] }),
    ];
    const tree = buildTagHierarchy(cards, 'what');
    // Only 'what:projects' appears — 'what' is not a valid filter value
    expect(tree).toHaveLength(1);
    expect(tree[0].value).toBe('what:projects');
  });
});

// ---------------------------------------------------------------------------
// buildAllDimensionHierarchies
// ---------------------------------------------------------------------------

describe('buildAllDimensionHierarchies', () => {
  it('returns all 5 dimensions even when some are empty', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what:projects'] }),
    ];
    const result = buildAllDimensionHierarchies(cards);
    expect(Object.keys(result)).toEqual(
      expect.arrayContaining(['what', 'when', 'where', 'who', 'why'])
    );
    expect(result.what).toHaveLength(1);
    expect(result.when).toHaveLength(0);
    expect(result.where).toHaveLength(0);
    expect(result.who).toHaveLength(0);
    expect(result.why).toHaveLength(0);
  });

  it('populates each dimension independently', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what:projects', 'why:professional'] }),
      fakeCardMeta({ uid: 'posts/b', tags: ['what:writing', 'when:2023'] }),
    ];
    const result = buildAllDimensionHierarchies(cards);
    expect(result.what.map(n => n.value)).toContain('what:projects');
    expect(result.what.map(n => n.value)).toContain('what:writing');
    expect(result.why[0].value).toBe('why:professional');
    expect(result.when[0].value).toBe('when:2023');
  });
});

// ---------------------------------------------------------------------------
// dimensionHasTags
// ---------------------------------------------------------------------------

describe('dimensionHasTags', () => {
  it('returns false when no cards have tags for the dimension', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['why:professional'] }),
    ];
    expect(dimensionHasTags(cards, 'what')).toBe(false);
  });

  it('returns true when at least one card has a valid tag for the dimension', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what:projects'] }),
    ];
    expect(dimensionHasTags(cards, 'what')).toBe(true);
  });

  it('returns false when only bare dimension root tags exist (no valid filter values)', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what'] }), // invalid
    ];
    expect(dimensionHasTags(cards, 'what')).toBe(false);
  });
});
