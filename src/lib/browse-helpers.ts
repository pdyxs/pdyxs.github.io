// Pure logic for the /browse page — no DOM, no Astro, no browser APIs.
//
// Extracts and organises 5W tags from a flat CardMeta list so the UI can
// render navigable dimension hierarchies.

import type { CardMeta } from './cards';
import { DIMENSIONS, isValidFilterValue } from './filters';
import type { Dimension } from './filters';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single node in the tag hierarchy for one dimension.
 *
 * Example for the tag `what:projects/games`:
 *   { value: 'what:projects/games', label: 'games', count: 3, children: [...] }
 *
 * `value` is the full `dimension:path` string used as a filter value.
 * `label` is just the last path segment (human-readable display).
 * `count` is the number of cards that prefix-match this node.
 */
export type TagNode = {
  value: string;         // e.g. 'what:projects/games'
  label: string;         // e.g. 'games'
  count: number;
  children: TagNode[];
};

// ---------------------------------------------------------------------------
// Extract dimension tags
// ---------------------------------------------------------------------------

/**
 * Returns all unique valid filter values for a given dimension, extracted
 * from the tags of the provided cards.
 *
 * Only tags that are valid filter values (i.e. `dimension:value`) are
 * included. Bare dimension roots (e.g. `what`) are excluded.
 */
export function extractDimensionTags(
  cards: CardMeta[],
  dimension: Dimension,
): string[] {
  const prefix = `${dimension}:`;
  const seen = new Set<string>();
  for (const card of cards) {
    for (const tag of card.tags) {
      if (tag.startsWith(prefix) && isValidFilterValue(tag)) {
        seen.add(tag);
      }
    }
  }
  return [...seen].sort();
}

// ---------------------------------------------------------------------------
// Count helpers
// ---------------------------------------------------------------------------

/**
 * Returns the number of cards whose tags include at least one tag that
 * prefix-matches the given value.
 *
 * A tag prefix-matches if it equals the value or starts with `value + '/'`.
 */
export function countMatchingCards(cards: CardMeta[], value: string): number {
  return cards.filter(card =>
    card.tags.some(tag => tag === value || tag.startsWith(value + '/'))
  ).length;
}

// ---------------------------------------------------------------------------
// Build tag hierarchy
// ---------------------------------------------------------------------------

/**
 * Builds a tree of TagNodes for a single dimension from a flat card list.
 *
 * The tree is nested: `what:projects` becomes a parent of
 * `what:projects/games`, which becomes a parent of
 * `what:projects/games/puzzle`.
 *
 * Nodes are sorted alphabetically by label at each level.
 */
export function buildTagHierarchy(
  cards: CardMeta[],
  dimension: Dimension,
): TagNode[] {
  const allTags = extractDimensionTags(cards, dimension);
  if (allTags.length === 0) return [];

  // Build a lookup of value → node (without children yet)
  const nodeMap = new Map<string, TagNode>();
  for (const tag of allTags) {
    nodeMap.set(tag, {
      value: tag,
      label: tagLabel(tag),
      count: countMatchingCards(cards, tag),
      children: [],
    });
  }

  // Sort all values so shorter paths come first (parent before child)
  const sorted = [...allTags].sort();

  const roots: TagNode[] = [];

  for (const tag of sorted) {
    const parentValue = findParentValue(tag, nodeMap);
    if (parentValue) {
      nodeMap.get(parentValue)!.children.push(nodeMap.get(tag)!);
    } else {
      roots.push(nodeMap.get(tag)!);
    }
  }

  // Sort children alphabetically at every level
  sortNodes(roots);

  return roots;
}

/**
 * Extracts the display label from a tag value.
 * For `what:projects/games`, returns `games`.
 * For `what:projects`, returns `projects`.
 */
function tagLabel(tagValue: string): string {
  const slashIdx = tagValue.lastIndexOf('/');
  if (slashIdx !== -1) return tagValue.slice(slashIdx + 1);
  const colonIdx = tagValue.indexOf(':');
  return colonIdx !== -1 ? tagValue.slice(colonIdx + 1) : tagValue;
}

/**
 * Finds the closest ancestor value present in the nodeMap.
 *
 * For `what:projects/games/puzzle` and nodeMap containing
 * `what:projects/games`, returns `what:projects/games`.
 * For `what:projects`, returns null (it is a root).
 */
function findParentValue(
  tagValue: string,
  nodeMap: Map<string, TagNode>,
): string | null {
  // Try progressively shorter prefixes
  let candidate = tagValue;
  while (true) {
    const slashIdx = candidate.lastIndexOf('/');
    if (slashIdx === -1) {
      // No more slash — try the bare `dimension:` prefix path (no parent)
      break;
    }
    candidate = candidate.slice(0, slashIdx);
    if (nodeMap.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

function sortNodes(nodes: TagNode[]): void {
  nodes.sort((a, b) => a.label.localeCompare(b.label));
  for (const node of nodes) {
    sortNodes(node.children);
  }
}

// ---------------------------------------------------------------------------
// Extract all dimension hierarchies at once
// ---------------------------------------------------------------------------

/**
 * Returns a map of dimension → tag hierarchy for all 5 dimensions.
 * Dimensions with no tags return an empty array.
 */
export function buildAllDimensionHierarchies(
  cards: CardMeta[],
): Record<Dimension, TagNode[]> {
  const result = {} as Record<Dimension, TagNode[]>;
  for (const dim of DIMENSIONS) {
    result[dim] = buildTagHierarchy(cards, dim);
  }
  return result;
}

/**
 * Returns true if a given dimension has any selectable filter values in
 * the provided card set.
 */
export function dimensionHasTags(cards: CardMeta[], dimension: Dimension): boolean {
  return extractDimensionTags(cards, dimension).length > 0;
}
