// Pure logic for the /browse page — no DOM, no Astro, no browser APIs.
//
// Extracts and organises 5W tags from a flat CardMeta list so the UI can
// render navigable dimension hierarchies.

import type { CardMeta } from './cards';
import { FIVE_W_DIMENSIONS, isValidFilterValue } from './five-w';
import type { FiveWDimension } from './five-w';
import type { DimensionId } from '../dimensions/id';
import { cardOwnValues } from './card-identity';
import { displayFor } from './tag-display';
import type { TagDisplay } from './tag-display';
import type { StatusValue } from './status-visibility';
import type { FolderSort } from './folder-sort';

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
  renderer: string;
  /** Resolved header-image thumbnail URL (fallback src), or absent when the card has no usable image. */
  thumb?: string;
  /** Responsive srcset for a local thumbnail (multiple widths); absent for remote images. */
  thumbSrcset?: string;
  /** Present only on a collapsed-folder representative: member count, for the count badge. */
  collapsed?: { count: number };
  /** Resolved publish-lifecycle status (see CardMeta.status), carried through
   * so the dev-only status facet (issue #52) can narrow the browse-family
   * lens's client-side card pool by real status, and so the dev-only status
   * badge (issue #51) can render per-card in listings. */
  status?: StatusValue;
  /**
   * Summed build-time priority (see priority.ts) and the card's folder-declared
   * sort with its own value resolved (folder-sort.ts). Both cross the wire
   * because the ranking comparator runs CLIENT-side — two of its six rungs
   * (filter-match count, seen-ness) are only knowable there, so the build-time
   * rungs have to travel with the card. See ranking.ts.
   *
   * Required, like `contentHash` and unlike `status`: every card has both (a
   * card declaring nothing resolves to 0 / the default sort), so the four
   * places that rehydrate a CardMeta from this payload can carry them straight
   * through instead of each inventing a neutral value.
   */
  priority: number;
  sort: FolderSort & { value?: number | string };
  /**
   * Sequence within this card's own folder (rung 4). Crosses the wire for the
   * same reason as `priority` and `sort` — the comparator runs client-side, so
   * a build-time rung left behind simply reads `undefined` and never fires.
   *
   * Optional, unlike those two, because absence is MEANINGFUL here: rung 4 only
   * separates a pair when BOTH cards declare an `order`, since one card's
   * sequence says nothing about a sibling that has none. Only 53 cards declare
   * it; a synthesised neutral default would make every undeclared card a
   * declared 0 and sort it ahead of an authored `order: 1`.
   */
  order?: number;
};

/**
 * What BrowseCard needs to render one row.
 *
 * Identical to SerialisedCard except `date`, which it tolerates unserialised:
 * the same component renders both the client-side browse pool (dates already
 * strings, having crossed the wire) and server-side CardMeta lists that never
 * serialise — GenericRenderer's `relatedCards`, the editorial status groups.
 * BrowseCard only ever does `new Date(card.date)`, which is happy either way.
 *
 * Widening here rather than at each call site keeps the coercion out of the
 * templates: the alternative is every CardMeta caller mapping dates to strings
 * purely to satisfy a prop, which is work that exists only to appease a type.
 */
export type BrowseCardData = Omit<SerialisedCard, 'date'> & {
  date?: string | Date | null;
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
  /** Which dimension offers this value. Carried on the node so a panel
   * selection routes by identity — without it the panel emits a bare string
   * and the receiver has to guess the axis from the value's shape. */
  dimensionId: DimensionId;
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
  /** Declared section label (the tag's `group`) used to partition root-level nodes into panel sections — see groupNodesIntoSections. Undefined for the default (ungrouped) section. */
  group?: string;
  /** Explicit sort order among siblings (lower first), taking precedence over the alphabetical fallback — see sortNodes. Undefined nodes sort alphabetically. */
  order?: number;
  /** A pure container: the row itself has no filter meaning, so clicking it
   * drills in rather than selecting `value` (see DimensionPanel). Used by the
   * dev-only Status facet node — see status-facet-node.ts. */
  drillOnly?: boolean;
};

/**
 * A run of tag nodes that render together in a dimension panel, separated from
 * adjacent sections by a divider (no heading is shown). `label` is the group
 * name — retained for identity/ordering only — and is undefined for the
 * ungrouped section. See groupNodesIntoSections.
 */
export type TagSection = {
  label?: string;
  nodes: TagNode[];
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
  dimension: FiveWDimension,
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
 * Exception: a tag that is some *other* card's own path (a "card-backed
 * tag") is a direct link to that card, not category membership, so it only
 * counts on an exact match — see cardOwnValues.
 *
 * As in applyFilters, `cardBackedValues` must come from the FULL card set:
 * `cards` here is the listing-filtered browse pool, so deriving it locally
 * misses draft/unlisted targets and over-counts their ancestors. Omitting it
 * keeps the pool-derived behaviour, correct only when `cards` is the full set.
 */
export function countMatchingCards(
  cards: CardMeta[],
  value: string,
  cardBackedValues: Set<string> = cardOwnValues(cards),
): number {
  return cards.filter(card =>
    card.tags.some(tag =>
      tag === value || (!cardBackedValues.has(tag) && tag.startsWith(value + '/'))
    )
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
  dimension: FiveWDimension,
  declaredValues: string[] = [],
  display: Record<string, TagDisplay> = {},
  cardBackedValues: Set<string> = cardOwnValues(cards),
): TagNode[] {
  const allTags = extractDimensionTags(cards, dimension, declaredValues);
  if (allTags.length === 0) return [];

  // Expand to include every intermediate ancestor prefix. A value set that
  // only contains leaves (e.g. `where:*` tags injected by a filter generator
  // without their `where:europe` / `where:europe/uk` parents ever being tagged
  // directly) would otherwise render flat — findParentValue only nests under an
  // ancestor that exists in the map. Synthesising the missing ancestors gives
  // them drill-down structure; their count rolls up via prefix matching.
  const allValues = new Set<string>();
  for (const tag of allTags) {
    allValues.add(tag);
    for (const ancestor of ancestorPrefixes(tag)) allValues.add(ancestor);
  }

  // Build a lookup of value → node (without children yet)
  const nodeMap = new Map<string, TagNode>();
  for (const tag of allValues) {
    nodeMap.set(tag, {
      dimensionId: dimension,
      value: tag,
      label: tagLabel(tag),
      ...displayFor(tag, display),
      count: countMatchingCards(cards, tag, cardBackedValues),
      children: [],
    });
  }

  // Sort all values so shorter paths come first (parent before child)
  const sorted = [...allValues].sort();

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
 * Every dimensioned ancestor prefix of a value, excluding the value itself and
 * the bare `dimension:` root. `where:europe/uk/london` yields
 * `['where:europe', 'where:europe/uk']`. Used to synthesise intermediate
 * hierarchy nodes for leaf-only value sets.
 */
function ancestorPrefixes(value: string): string[] {
  const colonIdx = value.indexOf(':');
  if (colonIdx === -1) return [];
  const dimension = value.slice(0, colonIdx);
  const segments = value.slice(colonIdx + 1).split('/');
  const out: string[] = [];
  let acc = '';
  for (let i = 0; i < segments.length - 1; i++) {
    acc = acc ? `${acc}/${segments[i]}` : segments[i];
    out.push(`${dimension}:${acc}`);
  }
  return out;
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
  // A declared `order` sorts ahead of the alphabetical fallback: nodes with an
  // order come first (lowest first), the rest sort by label. Siblings that all
  // declare an order (e.g. chronological `when` eras) are fully ordered by it.
  nodes.sort((a, b) =>
    (a.order ?? Infinity) - (b.order ?? Infinity) || a.label.localeCompare(b.label)
  );
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
): Record<FiveWDimension, TagNode[]> {
  const result = {} as Record<FiveWDimension, TagNode[]>;
  for (const dim of FIVE_W_DIMENSIONS) {
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
 * Partitions root-level tag nodes into ordered panel sections by their
 * declared `group`. Each distinct `group` becomes its own section; nodes with
 * no `group` form the final section, after all grouped ones.
 *
 * `groupOrder` (from the dimension's `_config.yaml`) fixes the order of the
 * grouped sections: groups appear in the order listed, then any group not
 * listed follows alphabetically. An empty/absent `groupOrder` orders all
 * grouped sections alphabetically. Empty sections are never emitted, so an
 * all-ungrouped node list yields a single section (rendering exactly as a flat
 * list — no divider).
 *
 * `label` carries the group name for identity/ordering, but panels render only
 * a divider between sections — the name is not shown (see DimensionPanel).
 *
 * Applied at every drill level (see FilterBar.svelte): most levels have no
 * grouped nodes at all and collapse to a single section, which renders exactly
 * as a flat list.
 */
export function groupNodesIntoSections(
  nodes: TagNode[],
  groupOrder: string[] = [],
): TagSection[] {
  const ungrouped: TagNode[] = [];
  const byGroup = new Map<string, TagNode[]>();
  for (const node of nodes) {
    if (node.group) {
      const bucket = byGroup.get(node.group);
      if (bucket) bucket.push(node);
      else byGroup.set(node.group, [node]);
    } else {
      ungrouped.push(node);
    }
  }

  const orderedGroups: string[] = [];
  for (const group of groupOrder) {
    if (byGroup.has(group) && !orderedGroups.includes(group)) orderedGroups.push(group);
  }
  for (const group of [...byGroup.keys()].sort((a, b) => a.localeCompare(b))) {
    if (!orderedGroups.includes(group)) orderedGroups.push(group);
  }

  const sections: TagSection[] = [];
  for (const group of orderedGroups) sections.push({ label: group, nodes: byGroup.get(group)! });
  if (ungrouped.length > 0) sections.push({ nodes: ungrouped });
  return sections;
}

/**
 * Returns true if a given dimension has any selectable filter values in
 * the provided card set.
 */
export function dimensionHasTags(
  cards: CardMeta[],
  dimension: FiveWDimension,
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

/**
 * Truncates a sorted browse-lens result set per its registry `config.limit`
 * (e.g. `{ limit: 6 }` on the `newest`/`oldest` entries, so they show only the
 * leading cards rather than the whole archive). Applied *after* filtering and
 * sorting, so it's the top N of what the visitor actually asked for. An absent,
 * non-numeric or non-positive limit leaves the set untouched.
 */
export function limitCardsForBrowse(cards: CardMeta[], config?: Record<string, unknown>): CardMeta[] {
  const limit = config?.limit;
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 0) return cards;
  return cards.length <= limit ? cards : cards.slice(0, limit);
}
