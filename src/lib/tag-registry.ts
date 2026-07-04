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
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CardMeta } from './cards';
import { DIMENSIONS, isValidFilterValue } from './filters';
import type { Dimension } from './filters';
import { humaniseSegment } from './tag-display';
import type { TagDisplay } from './tag-display';

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

export type TagRegistry = Record<Dimension, DimensionRegistry>;

/**
 * A declared identity for a dimension-rooted filter value — from a container
 * `_config.yaml` or a `<name>.tag.yaml` file. `value` is already in colon
 * form (e.g. "what:puzzles").
 */
export type ValueIdentity = {
  value: string;
  name?: string;
  description?: string;
};

// ---------------------------------------------------------------------------
// Name/description resolution
// ---------------------------------------------------------------------------

/**
 * Returns the full-path filter value a card's own folder represents (distinct
 * from its inherited path tag, which is its *parent* folder's value). Used
 * for name-source precedence (3): a card's own title supplies the display
 * name for its own value when some other card references it as a tag.
 */
function ownValueForCard(uid: string): string | undefined {
  const slashIdx = uid.indexOf('/');
  if (slashIdx === -1) return undefined;
  const dimension = uid.slice(0, slashIdx);
  const rest = uid.slice(slashIdx + 1);
  return rest ? `${dimension}:${rest}` : undefined;
}

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
): TagDisplay {
  const tagDecl = tagDeclarations.find(v => v.value === value);
  const container = containerIdentities.find(v => v.value === value);
  const cardTitle = cardTitleByValue.get(value);

  const name = tagDecl?.name ?? container?.name ?? cardTitle ?? humaniseSegment(value);
  const description = tagDecl?.description ?? container?.description;

  return description !== undefined ? { name, description } : { name };
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
  for (const card of cards) {
    const value = ownValueForCard(card.uid);
    if (value && !cardTitleByValue.has(value)) cardTitleByValue.set(value, card.title);
  }

  const result = {} as TagRegistry;

  for (const dim of DIMENSIONS) {
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
      display.set(value, resolveDisplay(value, tagDeclarations, containerIdentities, cardTitleByValue));
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

const CONTENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../content');

/** Real filesystem-backed TreeReader, rooted at src/content. */
export function makeContentTreeReader(): TreeReader {
  return {
    async listDir(dir: string): Promise<TreeEntry[]> {
      try {
        const entries = await readdir(resolve(CONTENT_DIR, dir), { withFileTypes: true });
        return entries.map(e => ({ name: e.name, isDirectory: e.isDirectory() }));
      } catch {
        return [];
      }
    },
    async readFile(path: string): Promise<string | null> {
      try {
        return await readFile(resolve(CONTENT_DIR, path), 'utf-8');
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

type YamlIdentity = { name?: string; description?: string };

async function walkDir(
  reader: TreeReader,
  dir: string,
  containerIdentities: ValueIdentity[],
  tagDeclarations: ValueIdentity[],
): Promise<void> {
  const entries = await reader.listDir(dir);

  const configEntry = entries.find(e => !e.isDirectory && e.name === '_config.yaml');
  if (configEntry && dir) {
    const text = await reader.readFile(dir ? `${dir}/_config.yaml` : '_config.yaml');
    if (text) {
      const parsed = (parseYaml(text) as YamlIdentity | null) ?? {};
      if (parsed.name || parsed.description) {
        const value = fsPathToValue(dir);
        if (value) containerIdentities.push({ value, name: parsed.name, description: parsed.description });
      }
    }
  }

  for (const entry of entries) {
    const childPath = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory) {
      await walkDir(reader, childPath, containerIdentities, tagDeclarations);
    } else if (entry.name.endsWith(TAG_YAML_SUFFIX)) {
      const text = await reader.readFile(childPath);
      if (text) {
        const parsed = (parseYaml(text) as YamlIdentity | null) ?? {};
        const stem = entry.name.slice(0, -TAG_YAML_SUFFIX.length);
        const declPath = dir ? `${dir}/${stem}` : stem;
        const value = fsPathToValue(declPath);
        if (value) tagDeclarations.push({ value, name: parsed.name, description: parsed.description });
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
): Promise<{ containerIdentities: ValueIdentity[]; tagDeclarations: ValueIdentity[] }> {
  const containerIdentities: ValueIdentity[] = [];
  const tagDeclarations: ValueIdentity[] = [];
  await walkDir(reader, '', containerIdentities, tagDeclarations);
  return { containerIdentities, tagDeclarations };
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
  return computeTagRegistry(cards, containerIdentities, tagDeclarations);
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
  for (const dim of DIMENSIONS) {
    for (const [value, display] of registry[dim].display) {
      flat[value] = display;
    }
  }
  return flat;
}
