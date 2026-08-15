// Build-time tag registry — replaces the retired `tag` content collection.
//
// Aggregates, per dimension, the enumerable filter-value list and a
// value → { name, description } display map, from four sources:
//   - container `_config.yaml` tag identities (a folder's own value)
//   - `<name>.tag.yaml` declarations (cross-cutting values with no folder)
//   - card-folder `index.md` titles (a card's own value, when referenced
//     elsewhere as a manual tag)
//   - tags actually used on content (so an undeclared-but-used value still
//     shows up)
//
// See dev decision DEC-006-tag-registry and the dimension-rooted-content-tree
// PRD for the full design.

import { load as parseYaml } from 'js-yaml';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { CardMeta } from './cards';
import { assertContentRoot } from './content-root';
import { FIVE_W_DIMENSIONS, isValidFilterValue } from './five-w';
import type { FiveWDimension } from './five-w';
import { ownValueForCard } from './card-identity';
import { declaredGeneratedFilterValues, generatedDisplayName, generatedGroup, generatedSortOrder } from './filter-generators';
import { humaniseSegment } from './tag-display';
import type { TagDisplay } from './tag-display';
import type { AffiliationDeclaration } from './affiliations';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { TagDisplay };

export type DimensionRegistry = {
  /** Sorted, deduped filter values for this dimension, e.g. "what:projects/games". */
  values: string[];
  /** Display info for every value in `values`. */
  display: Map<string, TagDisplay>;
};

export type TagRegistry = Record<FiveWDimension, DimensionRegistry>;

/**
 * A declared identity for a dimension-rooted filter value — from a container
 * `_config.yaml` or a `<name>.tag.yaml` file. `value` is already in colon
 * form (e.g. "what:puzzles").
 */
export type ValueIdentity = {
  value: string;
  name?: string;
  description?: string;
  /** Section this value belongs to within its dimension panel (declared `group`). */
  group?: string;
  /** Explicit sibling sort order (lower first); see sortNodes in browse-helpers.ts. */
  order?: number;
  /**
   * Content paths this value's membership grows from, making it an
   * *affiliation*: a value no card carries in its frontmatter, earned instead
   * by tagging a seed (transitively). Resolved by computeAffiliationTags
   * (affiliations.ts) and applied in getAllCards(). Only `.tag.yaml`
   * declarations may carry seeds — a container `_config.yaml` already owns its
   * folder's cards by path.
   */
  seeds?: string[];
  /**
   * Declared `priority` for this value — added to the priority of every card
   * carrying it (see priority.ts; `priority` is the one cascading key that
   * SUMS). Only ever set from a `.tag.yaml`: a container `_config.yaml`'s
   * priority reaches its cards as an *ancestor*, through resolveFolderCascade,
   * and counting it a second time here as a filter value would double it.
   */
  priority?: number;
};

// ---------------------------------------------------------------------------
// Name/description resolution
// ---------------------------------------------------------------------------

/**
 * Resolves display info for a value via name-source precedence: (1) a
 * `.tag.yaml` declaration; (2) a container `_config.yaml` identity; (3) the
 * title of the card-folder whose path *is* this value; (4) fallback —
 * humanise the last path segment. `name` and `description` are resolved
 * independently along the same precedence chain, so e.g. a tag.yaml `name`
 * with no `description` can still pick up a container's `description`.
 */
function resolveDisplay(
  value: string,
  tagDeclarations: ValueIdentity[],
  containerIdentities: ValueIdentity[],
  cardTitleByValue: Map<string, string>,
  cardUidByValue: Map<string, string>,
): TagDisplay {
  const tagDecl = tagDeclarations.find(v => v.value === value);
  const container = containerIdentities.find(v => v.value === value);
  const cardTitle = cardTitleByValue.get(value);
  const cardUid = cardUidByValue.get(value);
  const declared = !!tagDecl || !!container;

  const name = tagDecl?.name ?? container?.name ?? cardTitle ?? humaniseSegment(value);
  const description = tagDecl?.description ?? container?.description;
  const group = tagDecl?.group ?? container?.group;
  const order = tagDecl?.order ?? container?.order;

  return {
    name,
    ...(description !== undefined ? { description } : {}),
    declared,
    ...(cardUid ? { cardUid } : {}),
    ...(group !== undefined ? { group } : {}),
    ...(order !== undefined ? { order } : {}),
  };
}

// ---------------------------------------------------------------------------
// Registry computation
// ---------------------------------------------------------------------------

/**
 * Pure aggregation core. Takes already-resolved declaration lists (read from
 * the filesystem by the caller — see `discoverTagSources`) plus the loaded
 * card list, and returns the per-dimension value list and display map.
 */
export function computeTagRegistry(
  cards: CardMeta[],
  containerIdentities: ValueIdentity[] = [],
  tagDeclarations: ValueIdentity[] = [],
): TagRegistry {
  const cardTitleByValue = new Map<string, string>();
  const cardUidByValue = new Map<string, string>();
  for (const card of cards) {
    const value = ownValueForCard(card.uid);
    if (value && !cardTitleByValue.has(value)) {
      cardTitleByValue.set(value, card.title);
      cardUidByValue.set(value, card.uid);
    }
  }

  const result = {} as TagRegistry;

  for (const dim of FIVE_W_DIMENSIONS) {
    const prefix = `${dim}:`;
    const values = new Set<string>();

    for (const identity of containerIdentities) {
      if (identity.value.startsWith(prefix)) values.add(identity.value);
    }
    for (const decl of tagDeclarations) {
      if (decl.value.startsWith(prefix)) values.add(decl.value);
    }
    for (const card of cards) {
      for (const tag of card.tags) {
        if (tag.startsWith(prefix) && isValidFilterValue(tag)) values.add(tag);
      }
    }

    const sortedValues = [...values].sort();
    const display = new Map<string, TagDisplay>();
    for (const value of sortedValues) {
      display.set(value, resolveDisplay(value, tagDeclarations, containerIdentities, cardTitleByValue, cardUidByValue));
    }

    result[dim] = { values: sortedValues, display };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Filesystem discovery (thin effect — see makeFileReader in folder-config.ts
// for the same injected-reader pattern)
// ---------------------------------------------------------------------------

/** A directory entry as returned by a TreeReader's `listDir`. */
export type TreeEntry = { name: string; isDirectory: boolean };

/**
 * Abstracts filesystem access for `discoverTagSources` so it can be unit
 * tested against a fixture tree without touching real files.
 */
export type TreeReader = {
  /** Lists entries directly inside `dir` (relative to the content root; "" for the root itself). */
  listDir(dir: string): Promise<TreeEntry[]>;
  /** Reads a file's contents (relative to the content root), or null if it doesn't exist. */
  readFile(path: string): Promise<string | null>;
};

/** Real filesystem-backed TreeReader, rooted at src/content. */
export function makeContentTreeReader(): TreeReader {
  // Resolved (and verified) once per reader, never from this module's own
  // location — see content-root.ts for why that distinction is load-bearing.
  const contentRoot = assertContentRoot();
  return {
    async listDir(dir: string): Promise<TreeEntry[]> {
      try {
        const entries = await readdir(resolve(contentRoot, dir), { withFileTypes: true });
        return entries.map(e => ({ name: e.name, isDirectory: e.isDirectory() }));
      } catch {
        return [];
      }
    },
    async readFile(path: string): Promise<string | null> {
      try {
        return await readFile(resolve(contentRoot, path), 'utf-8');
      } catch {
        return null;
      }
    },
  };
}

const TAG_YAML_SUFFIX = '.tag.yaml';

/** Converts a dimension-rooted filesystem path ("what/puzzles") to a colon-form filter value ("what:puzzles"), or undefined for a bare dimension root. */
function fsPathToValue(path: string): string | undefined {
  const slashIdx = path.indexOf('/');
  if (slashIdx === -1) return undefined;
  return `${path.slice(0, slashIdx)}:${path.slice(slashIdx + 1)}`;
}

type YamlIdentity = { name?: string; description?: string; group?: string; order?: unknown; seeds?: unknown; priority?: unknown };
type YamlDimensionConfig = { groupOrder?: unknown };

/** Coerces a parsed `seeds` value to a clean string[], or undefined if it isn't a non-empty string list. */
function parseSeeds(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seeds = raw.filter((s): s is string => typeof s === 'string' && s.length > 0);
  return seeds.length > 0 ? seeds : undefined;
}

/** Coerces a parsed `groupOrder` value to a clean string[], or undefined if it isn't a string list. */
function parseGroupOrder(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const groups = raw.filter((g): g is string => typeof g === 'string');
  return groups.length > 0 ? groups : undefined;
}

async function walkDir(
  reader: TreeReader,
  dir: string,
  containerIdentities: ValueIdentity[],
  tagDeclarations: ValueIdentity[],
  dimensionGroupOrder: Partial<Record<FiveWDimension, string[]>>,
): Promise<void> {
  const entries = await reader.listDir(dir);

  const configEntry = entries.find(e => !e.isDirectory && e.name === '_config.yaml');
  if (configEntry && dir) {
    const text = await reader.readFile(dir ? `${dir}/_config.yaml` : '_config.yaml');
    if (text) {
      const parsed = (parseYaml(text) as (YamlIdentity & YamlDimensionConfig) | null) ?? {};
      const order = typeof parsed.order === 'number' ? parsed.order : undefined;
      if (parsed.name || parsed.description || parsed.group || order !== undefined) {
        const value = fsPathToValue(dir);
        if (value) containerIdentities.push({ value, name: parsed.name, description: parsed.description, group: parsed.group, order });
      }
      // A dimension-root `_config.yaml` (dir is exactly a dimension name) may
      // declare `groupOrder` to fix the order of that dimension's panel
      // sections — see groupNodesIntoSections in browse-helpers.ts.
      if ((FIVE_W_DIMENSIONS as readonly string[]).includes(dir)) {
        const groupOrder = parseGroupOrder(parsed.groupOrder);
        if (groupOrder) dimensionGroupOrder[dir as FiveWDimension] = groupOrder;
      }
    }
  }

  for (const entry of entries) {
    const childPath = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory) {
      await walkDir(reader, childPath, containerIdentities, tagDeclarations, dimensionGroupOrder);
    } else if (entry.name.endsWith(TAG_YAML_SUFFIX)) {
      const text = await reader.readFile(childPath);
      if (text) {
        const parsed = (parseYaml(text) as YamlIdentity | null) ?? {};
        const order = typeof parsed.order === 'number' ? parsed.order : undefined;
        const stem = entry.name.slice(0, -TAG_YAML_SUFFIX.length);
        const declPath = dir ? `${dir}/${stem}` : stem;
        const value = fsPathToValue(declPath);
        const seeds = parseSeeds(parsed.seeds);
        const priority = typeof parsed.priority === 'number' ? parsed.priority : undefined;
        if (value) tagDeclarations.push({ value, name: parsed.name, description: parsed.description, group: parsed.group, order, seeds, priority });
      }
    }
  }
}

/**
 * Walks the content tree via `reader`, discovering every container
 * `_config.yaml` tag identity and every `<name>.tag.yaml` declaration.
 * Read from the filesystem (not content-collection entries) because the
 * content glob is markdown-only (see content.config.ts).
 */
export async function discoverTagSources(
  reader: TreeReader,
): Promise<{
  containerIdentities: ValueIdentity[];
  tagDeclarations: ValueIdentity[];
  dimensionGroupOrder: Partial<Record<FiveWDimension, string[]>>;
}> {
  const containerIdentities: ValueIdentity[] = [];
  const tagDeclarations: ValueIdentity[] = [];
  const dimensionGroupOrder: Partial<Record<FiveWDimension, string[]>> = {};
  await walkDir(reader, '', containerIdentities, tagDeclarations, dimensionGroupOrder);
  return { containerIdentities, tagDeclarations, dimensionGroupOrder };
}

/**
 * Returns the declared panel-section order per dimension, read from each
 * dimension-root `_config.yaml`'s `groupOrder` key. Dimensions without a
 * declaration are absent — callers fall back to the default (alphabetical)
 * ordering in groupNodesIntoSections. Consumed by the browse filter bar.
 */
export async function getDimensionGroupOrder(
  reader: TreeReader = makeContentTreeReader(),
): Promise<Partial<Record<FiveWDimension, string[]>>> {
  const { dimensionGroupOrder } = await discoverTagSources(reader);
  return dimensionGroupOrder;
}

/**
 * Every `.tag.yaml` declaration that carries `seeds:`, as affiliation
 * declarations. Read by getAllCards() (cards.ts) — which needs them *before*
 * the registry runs, since the affiliation tags it applies are part of what the
 * registry then aggregates.
 */
export async function discoverAffiliations(
  reader: TreeReader = makeContentTreeReader(),
): Promise<AffiliationDeclaration[]> {
  const { tagDeclarations } = await discoverTagSources(reader);
  return tagDeclarations
    .filter((decl): decl is ValueIdentity & { seeds: string[] } => !!decl.seeds)
    .map(({ value, seeds }) => ({ value, seeds }));
}

/**
 * Every `.tag.yaml`-declared `priority`, as a value → number map. Read by
 * getAllCards() (cards.ts), which adds each card's tagged values' priorities to
 * the sum — see resolveCardPriority in priority.ts.
 *
 * Container `_config.yaml` priorities are deliberately absent: a folder counts
 * once, as an ancestor.
 */
export async function discoverTagPriorities(
  reader: TreeReader = makeContentTreeReader(),
): Promise<Record<string, number>> {
  const { tagDeclarations } = await discoverTagSources(reader);
  const priorities: Record<string, number> = {};
  for (const decl of tagDeclarations) {
    if (decl.priority !== undefined) priorities[decl.value] = decl.priority;
  }
  return priorities;
}

/**
 * Assembles the full tag registry: discovers container/tag.yaml declarations
 * from the filesystem via `reader`, then aggregates them with the already-
 * loaded card list. `cards` is passed in (rather than re-fetched) since the
 * caller (getAllCards()) already has it — see cards.ts.
 */
export async function getTagRegistry(
  cards: CardMeta[],
  reader: TreeReader = makeContentTreeReader(),
): Promise<TagRegistry> {
  const { containerIdentities, tagDeclarations } = await discoverTagSources(reader);
  // Filter-generator values (e.g. travel-log `where:*` tags) that actually
  // land on a card are declared identities: they surface in the panel like a
  // `.tag.yaml` would, unlike a plain tag that only appears on a card. Names
  // fall back to humanisation. Post-less locations are excluded.
  const presentTags = cards.flatMap(card => card.tags);
  const generatedDeclarations: ValueIdentity[] = declaredGeneratedFilterValues(presentTags).map(value => {
    const name = generatedDisplayName(value);
    const order = generatedSortOrder(value);
    const group = generatedGroup(value);
    return {
      value,
      ...(name ? { name } : {}),
      ...(order !== undefined ? { order } : {}),
      ...(group !== undefined ? { group } : {}),
    };
  });
  return computeTagRegistry(cards, containerIdentities, [...tagDeclarations, ...generatedDeclarations]);
}

// ---------------------------------------------------------------------------
// Client serialisation
// ---------------------------------------------------------------------------

/**
 * Flattens a TagRegistry's per-dimension `display` Maps into a single plain
 * object keyed by full filter value (e.g. "what:puzzles"). Values are
 * globally unique across dimensions (each is dimension-prefixed), so a flat
 * object loses no information and is directly JSON-serialisable — unlike a
 * Map, which Astro's client-directive prop serialisation can't carry. Pass
 * the result as a prop to any client-rendered component that needs to
 * resolve a raw tag string's display name (see tag-display.ts's `displayFor`).
 */
export function flattenTagDisplay(registry: TagRegistry): Record<string, TagDisplay> {
  const flat: Record<string, TagDisplay> = {};
  for (const dim of FIVE_W_DIMENSIONS) {
    for (const [value, display] of registry[dim].display) {
      flat[value] = display;
    }
  }
  return flat;
}
