// Pure logic for the /browse page — no DOM, no Astro, no browser APIs.
//
// Extracts and organises 5W tags from a flat CardMeta list so the UI can
// render navigable dimension hierarchies.

import type { CardMeta } from './cards';
import { DIMENSIONS, isValidFilterValue } from './filters';
import type { Dimension } from './filters';
import { displayFor } from './tag-display';
import type { TagDisplay } from './tag-display';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Serialised representation of a card passed from SSR to the browse client. */
export type SerialisedCard = {
  uid: string;
  title: string;
  description?: string;
  date: string | null;
  tags: string[];
  collection: string;
  id: string;
  renderer: string;
};

/**
 * A single node in the tag hierarchy for one dimension.
 *
 * Example for the tag `what:projects/games`:
 *   { value: 'what:projects/games', label: 'games', count: 3, children: [...] }
 *
 * `value` is the full `dimension:path` string used as a filter value.
 * `label` is just the last path segment (human-readable display).
 * `name` is the declared display name from the tag registry, falling back
 * to a humanised `label` when nothing is declared — this is what the UI
 * should render, not `label` or `value`.
 * `description` is present only when the registry declares one (for a
 * popover / tooltip).
 * `count` is the number of cards that prefix-match this node.
 */
export type TagNode = {
  value: string;         // e.g. 'what:projects/games'
  label: string;         // e.g. 'games'
  name: string;           // e.g. 'Games' or a declared display name
  description?: string;
  count: number;
  children: TagNode[];
  /** True when this value has a container `_config.yaml` or `<name>.tag.yaml` identity — see tag-registry.ts. Drives filterVisibleNodes. */
  declared?: boolean;
  /** Set when this value is exactly some card's own path — the uid to navigate to instead of filtering. */
  cardUid?: string;
};

// ---------------------------------------------------------------------------
// Extract dimension tags
// ---------------------------------------------------------------------------

/**
 * Returns all unique valid filter values for a given dimension.
 *
 * This is the union of two sources:
 *   - tags actually used on the provided cards' `tags` arrays
 *   - `declaredValues`: the tag registry's per-dimension value list (see
 *     tag-registry.ts), already in colon-form filter-value shape (e.g.
 *     "what:projects/games") — a value declared there shows up even before
 *     any content uses it.
 *
 * Only tags that are valid filter values (i.e. `dimension:value`) are
 * included. Bare dimension roots (e.g. `what`) are excluded.
 */
export function extractDimensionTags(
  cards: CardMeta[],
  dimension: Dimension,
  declaredValues: string[] = [],
): string[] {
  const prefix = `${dimension}:`;
  const seen = new Set<string>();
  for (const value of declaredValues) {
    if (value.startsWith(prefix) && isValidFilterValue(value)) {
      seen.add(value);
    }
  }
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
  declaredValues: string[] = [],
  display: Record<string, TagDisplay> = {},
): TagNode[] {
  const allTags = extractDimensionTags(cards, dimension, declaredValues);
  if (allTags.length === 0) return [];

  // Build a lookup of value → node (without children yet)
  const nodeMap = new Map<string, TagNode>();
  for (const tag of allTags) {
    nodeMap.set(tag, {
      value: tag,
      label: tagLabel(tag),
      ...displayFor(tag, display),
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
  declaredValues: string[] = [],
  display: Record<string, TagDisplay> = {},
): Record<Dimension, TagNode[]> {
  const result = {} as Record<Dimension, TagNode[]>;
  for (const dim of DIMENSIONS) {
    result[dim] = buildTagHierarchy(cards, dim, declaredValues, display);
  }
  return result;
}

/**
 * Recursively filters a tag-node tree down to nodes that should actually be
 * offered in a dimension panel: a declared value (container `_config.yaml`
 * or `<name>.tag.yaml` identity) or a value that is already an active
 * selection. Undeclared values (e.g. card-backed tags, or any other
 * freeform-but-used value) are hidden from the browsing panel unless
 * already selected — otherwise-active filters never disappear out from
 * under the user.
 *
 * Filtering is applied at every level, so a node's `children` in the result
 * only ever contain visible descendants too (this also governs whether a
 * "drill in" affordance should show for that node).
 */
export function filterVisibleNodes(nodes: TagNode[], activeValues: Set<string>): TagNode[] {
  const result: TagNode[] = [];
  for (const node of nodes) {
    if (!node.declared && !activeValues.has(node.value)) continue;
    result.push({ ...node, children: filterVisibleNodes(node.children, activeValues) });
  }
  return result;
}

/**
 * Returns true if a given dimension has any selectable filter values in
 * the provided card set.
 */
export function dimensionHasTags(
  cards: CardMeta[],
  dimension: Dimension,
  declaredValues: string[] = [],
): boolean {
  return extractDimensionTags(cards, dimension, declaredValues).length > 0;
}

// ---------------------------------------------------------------------------
// Browse-lens sorting
// ---------------------------------------------------------------------------

/**
 * Sorts cards for a browse-family lens per its registry `config` (see
 * lens-registry.ts, e.g. `{ sortKey: 'date', sortDirection: 'desc' }` on the
 * `newest` entry). Unrecognised or absent config leaves the input order
 * untouched — a lens declaring no sort config just shows cards as given.
 */
export function sortCardsForBrowse(cards: CardMeta[], config?: Record<string, unknown>): CardMeta[] {
  if (config?.sortKey !== 'date') return cards;
  const descending = config.sortDirection !== 'asc';
  return [...cards].sort((a, b) => {
    const diff = (a.date?.getTime() ?? -Infinity) - (b.date?.getTime() ?? -Infinity);
    return descending ? -diff : diff;
  });
}
