import { describe, it, expect } from 'vitest';
import {
  extractDimensionTags,
  countMatchingCards,
  buildTagHierarchy,
  buildAllDimensionHierarchies,
  dimensionHasTags,
  sortCardsForBrowse,
  filterVisibleNodes,
} from './browse-helpers';
import type { TagNode } from './browse-helpers';
import { computeTagRegistry, flattenTagDisplay } from './tag-registry';
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

  it('includes declared values (from the tag registry) even when no card uses them yet', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what:projects'] }),
    ];
    const result = extractDimensionTags(cards, 'what', ['what:projects/edtech']);
    expect(result).toContain('what:projects');
    expect(result).toContain('what:projects/edtech');
  });

  it('deduplicates when a declared value is also used on a card', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what:projects/games'] }),
    ];
    const result = extractDimensionTags(cards, 'what', ['what:projects/games']);
    expect(result).toEqual(['what:projects/games']);
  });

  it('excludes declared values from other dimensions', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what:projects'] }),
    ];
    const result = extractDimensionTags(cards, 'why', ['what:projects/edtech']);
    expect(result).toEqual([]);
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

  it('falls back to a humanised segment for name when no display map is given', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what:projects/data-art'] }),
    ];
    const tree = buildTagHierarchy(cards, 'what');
    expect(tree[0].name).toBe('Data Art');
    expect(tree[0].description).toBeUndefined();
  });

  it('uses the declared name from the display map when present', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what:puzzles'] }),
    ];
    const tree = buildTagHierarchy(cards, 'what', [], {
      'what:puzzles': { name: 'Puzzles' },
    });
    expect(tree[0].name).toBe('Puzzles');
  });

  it('carries a description from the display map when present', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what:puzzles'] }),
    ];
    const tree = buildTagHierarchy(cards, 'what', [], {
      'what:puzzles': { name: 'Puzzles', description: 'Logic puzzles' },
    });
    expect(tree[0].description).toBe('Logic puzzles');
  });

  it('leaves description undefined when the display map has no description for the value', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what:puzzles'] }),
    ];
    const tree = buildTagHierarchy(cards, 'what', [], {
      'what:puzzles': { name: 'Puzzles' },
    });
    expect(tree[0].description).toBeUndefined();
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

  it('includes a declared-but-unused value as a zero-count node', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what:projects'] }),
    ];
    const tree = buildTagHierarchy(cards, 'what', ['what:projects/edtech']);
    const root = tree.find(n => n.value === 'what:projects')!;
    const edtech = root.children.find(c => c.value === 'what:projects/edtech');
    expect(edtech).toBeDefined();
    expect(edtech!.count).toBe(0);
  });

  it('uses a declared registry value to seed an intermediate parent node with no direct card usage', () => {
    // No card is tagged bare 'what:projects', only 'what:projects/games' is used.
    // Declaring 'what:projects' in the registry should nest 'games' under it.
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['what:projects/games'] }),
    ];
    const tree = buildTagHierarchy(cards, 'what', ['what:projects']);
    expect(tree).toHaveLength(1);
    expect(tree[0].value).toBe('what:projects');
    expect(tree[0].count).toBe(1);
    expect(tree[0].children.map(c => c.value)).toEqual(['what:projects/games']);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: tag registry -> flattened display map -> TagNode
// ---------------------------------------------------------------------------
//
// The unit tests above feed buildTagHierarchy a hand-built display map.
// These confirm the real pipeline (computeTagRegistry -> flattenTagDisplay)
// produces a node with the right name, for each of the registry's
// name-source precedence cases that matter to the UI.

describe('buildTagHierarchy fed by a real tag registry', () => {
  it('shows a card-folder title as the name for a value with no other declaration', () => {
    const referencing = fakeCardMeta({ uid: 'what/writing/a-post', tags: ['what:projects/particulars'] });
    const project = fakeCardMeta({ uid: 'what/projects/particulars', title: 'Particulars', tags: ['what:projects'] });
    const cards = [referencing, project];

    const registry = computeTagRegistry(cards);
    const display = flattenTagDisplay(registry);
    const tree = buildTagHierarchy(cards, 'what', registry.what.values, display);

    const root = tree.find(n => n.value === 'what:projects')!;
    const node = root.children.find(c => c.value === 'what:projects/particulars')!;
    expect(node.name).toBe('Particulars');
  });

  it('falls back to a humanised segment when neither a declaration nor a card title exists', () => {
    const cards = [fakeCardMeta({ uid: 'posts/a', tags: ['what:projects/data-art'] })];

    const registry = computeTagRegistry(cards);
    const display = flattenTagDisplay(registry);
    const tree = buildTagHierarchy(cards, 'what', registry.what.values, display);

    expect(tree[0].name).toBe('Data Art');
    expect(tree[0].description).toBeUndefined();
  });

  it('carries a container-declared description through to the node', () => {
    const cards = [fakeCardMeta({ uid: 'what/puzzles/sudoku', title: 'Sudoku', tags: ['what:puzzles'] })];
    const containerIdentities = [{ value: 'what:puzzles', name: 'Puzzles', description: 'Logic puzzles' }];

    const registry = computeTagRegistry(cards, containerIdentities);
    const display = flattenTagDisplay(registry);
    const tree = buildTagHierarchy(cards, 'what', registry.what.values, display);

    expect(tree[0].name).toBe('Puzzles');
    expect(tree[0].description).toBe('Logic puzzles');
  });
});

// ---------------------------------------------------------------------------
// filterVisibleNodes
// ---------------------------------------------------------------------------

describe('filterVisibleNodes', () => {
  function node(overrides: Partial<TagNode> & { value: string }): TagNode {
    return {
      label: overrides.value,
      name: overrides.value,
      count: 0,
      children: [],
      declared: false,
      ...overrides,
    };
  }

  it('keeps a declared node', () => {
    const nodes = [node({ value: 'what:projects', declared: true })];
    expect(filterVisibleNodes(nodes, new Set())).toHaveLength(1);
  });

  it('drops an undeclared node with no active selection', () => {
    const nodes = [node({ value: 'what:projects/budget-haver', declared: false })];
    expect(filterVisibleNodes(nodes, new Set())).toEqual([]);
  });

  it('keeps an undeclared node that is currently selected', () => {
    const nodes = [node({ value: 'what:projects/budget-haver', declared: false })];
    const result = filterVisibleNodes(nodes, new Set(['what:projects/budget-haver']));
    expect(result.map(n => n.value)).toEqual(['what:projects/budget-haver']);
  });

  it('recursively filters children, dropping undeclared/unselected leaves', () => {
    const nodes = [
      node({
        value: 'what:projects',
        declared: true,
        children: [
          node({ value: 'what:projects/games', declared: true }),
          node({ value: 'what:projects/budget-haver', declared: false }),
        ],
      }),
    ];
    const result = filterVisibleNodes(nodes, new Set());
    expect(result[0].children.map(c => c.value)).toEqual(['what:projects/games']);
  });

  it('keeps an undeclared child when it is the active selection', () => {
    const nodes = [
      node({
        value: 'what:projects',
        declared: true,
        children: [node({ value: 'what:projects/budget-haver', declared: false })],
      }),
    ];
    const result = filterVisibleNodes(nodes, new Set(['what:projects/budget-haver']));
    expect(result[0].children.map(c => c.value)).toEqual(['what:projects/budget-haver']);
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

  it('returns true when a tag is declared in the registry even if no card uses it', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a', tags: ['why:professional'] }),
    ];
    expect(dimensionHasTags(cards, 'what', ['what:projects/edtech'])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// sortCardsForBrowse
// ---------------------------------------------------------------------------

describe('sortCardsForBrowse', () => {
  const older = fakeCardMeta({ uid: 'posts/older', title: 'Older', date: new Date('2020-01-01') });
  const newer = fakeCardMeta({ uid: 'posts/newer', title: 'Newer', date: new Date('2024-01-01') });
  const undated = fakeCardMeta({ uid: 'posts/undated', title: 'Undated' });

  it('sorts by date descending when configured (matches the newest lens)', () => {
    const result = sortCardsForBrowse([older, newer], { sortKey: 'date', sortDirection: 'desc' });
    expect(result.map(c => c.uid)).toEqual(['posts/newer', 'posts/older']);
  });

  it('sorts by date ascending when sortDirection is "asc"', () => {
    const result = sortCardsForBrowse([newer, older], { sortKey: 'date', sortDirection: 'asc' });
    expect(result.map(c => c.uid)).toEqual(['posts/older', 'posts/newer']);
  });

  it('defaults to descending when sortDirection is absent', () => {
    const result = sortCardsForBrowse([older, newer], { sortKey: 'date' });
    expect(result.map(c => c.uid)).toEqual(['posts/newer', 'posts/older']);
  });

  it('sorts undated cards last under descending order', () => {
    const result = sortCardsForBrowse([undated, newer], { sortKey: 'date', sortDirection: 'desc' });
    expect(result.map(c => c.uid)).toEqual(['posts/newer', 'posts/undated']);
  });

  it('leaves order untouched when config is absent', () => {
    const result = sortCardsForBrowse([newer, older]);
    expect(result.map(c => c.uid)).toEqual(['posts/newer', 'posts/older']);
  });

  it('leaves order untouched for an unrecognised sortKey', () => {
    const result = sortCardsForBrowse([newer, older], { sortKey: 'title' });
    expect(result.map(c => c.uid)).toEqual(['posts/newer', 'posts/older']);
  });

  it('does not mutate the input array', () => {
    const input = [older, newer];
    sortCardsForBrowse(input, { sortKey: 'date', sortDirection: 'desc' });
    expect(input.map(c => c.uid)).toEqual(['posts/older', 'posts/newer']);
  });
});
