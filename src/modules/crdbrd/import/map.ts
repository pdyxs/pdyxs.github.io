// Maps one game from the old crdbrd.design dump (see dump.ts, read.ts) to a
// crdbrd Game. Pure: a DumpGame in; the game, the image files to copy, and
// warnings out. Anything it cannot place is warned about, never silently dropped.
//
// What the old tool (pdyxs/crdbrd.design, 2018 React/Firestore app) stored,
// read from src/js/crdbrd/*.js and src/js/modules/{properties,firestore-object}:
//
// - Every object is a Firestore doc with `name`, `active` (false = soft-deleted
//   by the undo system; such docs are skipped without a warning) and, for
//   nestable things (concepts, sets), `parent` (a sibling doc id).
// - Layout under games/<game>: properties/, images/, concepts/<c>/{properties,
//   entities}/, components/<set>/{properties}/ (sets live in `components`) and
//   specifications. The old code reads specifications from set/<set>/specifications
//   although it reads sets from `components`; read.ts accepts both.
// - A property doc is {name, type, ...constraints}: number has min/max, entity
//   has `concept`. Types: number, text, colour, image, boolean, entity.
// - A value is stored on the owner's own doc (game, entity, specification),
//   keyed by property id. Missing means the type's default.
// - A colour value is {r,g,b,a}; an image value is the id of a record in
//   games/<g>/images ({name, path: "images/<g>/<uuid>.<ext>", url}); an entity
//   value is an entity id.
// - A specification is {count, <property id>: value...}. The UI shows `count || 1`
//   and shows "<count> of <values>". There is no name.
//
// Per-concept quantities: the old tool never implemented them. components.md
// describes "2 action cards per action per player", but a specification has no
// field for it and the Specification UI offers only a count and the set's
// property values. The old way to get N per entity was one specification per
// entity (an entity-typed property carrying the entity). So `per` is always []
// here, and each old specification becomes one component with its count. If a
// game's specifications read as "one per X" they are listed explicitly; collapsing
// them into per-concepts is for the editor, not the mapper.
//
// Other deliberate choices: ids are kept from Firestore (stable across re-runs,
// and unique); concept `count` is the number of entities (a hint only); a
// component is named by its first non-empty text value, else "Specification N";
// colour alpha is dropped with a warning (crdbrd colours are #rrggbb); sets get
// no `size`, which the model reads as the placeholder card size and the editor
// flags until set; no templates. The old `designs` subcollection holds only a
// name per design (the design tool was never built), so it is not read.

import { assetContentType } from '../../../lib/dev-editors/paths.ts';
import type { Component, ComponentSet, Concept, Game, Property, PropertyType, Value } from '../model/types.ts';

export interface Doc {
  id: string;
  [field: string]: unknown;
}
export interface DumpConcept extends Doc {
  properties: Doc[];
  entities: Doc[];
}
export interface DumpSet extends Doc {
  properties: Doc[];
  specifications: Doc[];
}
export interface DumpGame {
  id: string;
  doc: Record<string, unknown>;
  properties: Doc[];
  concepts: DumpConcept[];
  sets: DumpSet[];
  images: Doc[];
}

export interface MapResult {
  game: Game;
  images: { from: string; to: string }[];
  warnings: string[];
}

interface Ctx {
  warnings: string[];
  /** Ids of the concepts and entities that survive the import, for checking references. */
  concepts: Set<string>;
  entities: Set<string>;
  /** Image records by id; the dump's Storage path is on each. */
  imageDocs: Map<string, Doc>;
  /** Files to copy, dump-relative path to card filename; the order they were first used. */
  files: Map<string, string>;
}

/** The card filename for image record `id`, queueing its file to copy; null with a warning if it cannot be placed. */
function useImage(ctx: Ctx, owner: string, propName: string, id: unknown): string | null {
  if (id == null || id === '') return null;
  const doc = typeof id === 'string' ? ctx.imageDocs.get(id) : undefined;
  const from = doc?.path;
  if (typeof from !== 'string' || from === '') {
    ctx.warnings.push(`${owner}: image "${propName}" points at an image record that is missing from the dump; left empty`);
    return null;
  }
  const to = from.slice(from.lastIndexOf('/') + 1);
  if (!ctx.files.has(from)) {
    ctx.files.set(from, to);
    if (assetContentType(to) === null) ctx.warnings.push(`${owner}: image file "${to}" is not a type the card editor serves (png, jpg, webp, gif, svg)`);
  }
  return to;
}

/** Bounds default to the old tool's 0 to 10; junk or reversed bounds are repaired, with a warning. */
function numberType(ctx: Ctx, owner: string, name: string, doc: Doc): PropertyType {
  const bound = (raw: unknown, fallback: number) => {
    if (raw == null || raw === '') return fallback;
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    ctx.warnings.push(`${owner}: number "${name}" has an unusable bound (${JSON.stringify(raw)}); used ${fallback}`);
    return fallback;
  };
  const min = bound(doc.min, 0);
  const max = bound(doc.max, 10);
  if (min <= max) return { kind: 'number', min, max };
  ctx.warnings.push(`${owner}: number "${name}" had its minimum (${min}) above its maximum (${max}); swapped`);
  return { kind: 'number', min: max, max: min };
}

function mapProperty(ctx: Ctx, owner: string, doc: Doc): Property | null {
  const id = doc.id;
  const name = String(doc.name ?? '');
  switch (doc.type) {
    case 'number': return { id, name, type: numberType(ctx, owner, name, doc) };
    case 'text': return { id, name, type: { kind: 'text' } };
    case 'boolean': return { id, name, type: { kind: 'boolean' } };
    case 'colour': return { id, name, type: { kind: 'colour' } };
    case 'image': return { id, name, type: { kind: 'image' } };
    case 'entity':
      if (typeof doc.concept === 'string' && ctx.concepts.has(doc.concept)) return { id, name, type: { kind: 'reference', concept: doc.concept } };
      ctx.warnings.push(`${owner}: property "${name}" points at no existing concept, so it and its values were dropped`);
      return null;
    default:
      ctx.warnings.push(`${owner}: property "${name}" has unknown type "${String(doc.type)}", so it and its values were dropped`);
      return null;
  }
}

const mapProperties = (ctx: Ctx, owner: string, docs: Doc[]): Property[] =>
  docs.filter(isActive).flatMap((d) => mapProperty(ctx, owner, d) ?? []);

const isActive = (d: Doc) => d.active !== false;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const hex2 = (n: unknown) => Math.max(0, Math.min(255, Math.round(Number(n)))).toString(16).padStart(2, '0');

function mapValue(ctx: Ctx, owner: string, p: Property, v: unknown): Value | undefined {
  switch (p.type.kind) {
    case 'number': return typeof v === 'number' ? v : undefined;
    case 'text': return typeof v === 'string' ? v : undefined;
    case 'boolean': return typeof v === 'boolean' ? v : undefined;
    case 'colour': {
      if (!isObj(v)) return undefined;
      if (v.a !== undefined && Number(v.a) !== 1) ctx.warnings.push(`${owner}: colour "${p.name}" has transparency (alpha ${v.a}), which crdbrd colours do not keep`);
      return `#${hex2(v.r)}${hex2(v.g)}${hex2(v.b)}`;
    }
    case 'image': return v === undefined ? undefined : useImage(ctx, owner, p.name, v);
    case 'reference': {
      if (v === undefined) return undefined;
      if (v === null || v === '') return null;
      if (typeof v === 'string' && ctx.entities.has(v)) return v;
      ctx.warnings.push(`${owner}: "${p.name}" points at an entity that no longer exists; left empty`);
      return null;
    }
    default: return undefined;
  }
}

function mapValues(ctx: Ctx, owner: string, raw: Record<string, unknown>, props: Property[]): Record<string, Value> {
  const values: Record<string, Value> = {};
  for (const p of props) {
    const v = mapValue(ctx, owner, p, raw[p.id]);
    if (v !== undefined) values[p.id] = v;
  }
  return values;
}

/**
 * Docs nested by their `parent` field. A doc whose parent is gone, or that sits
 * in a parent cycle, becomes top-level with a warning rather than disappearing.
 */
function tree<D extends Doc, N>(ctx: Ctx, kind: string, docs: D[], build: (doc: D, children: N[]) => N): N[] {
  const ids = new Set(docs.map((d) => d.id));
  const done = new Set<string>();
  const grow = (doc: D): N => {
    done.add(doc.id);
    return build(doc, docs.filter((d) => d.parent === doc.id && !done.has(d.id)).map(grow));
  };
  const out: N[] = [];
  for (const d of docs) {
    if (d.parent == null || d.parent === '') out.push(grow(d));
    else if (!ids.has(d.parent as string)) {
      ctx.warnings.push(`${kind} "${d.name}" belongs to a ${kind} that no longer exists; moved to the top level`);
      out.push(grow(d));
    }
  }
  for (const d of docs) {
    if (done.has(d.id)) continue;
    ctx.warnings.push(`${kind} "${d.name}" is in a parent cycle; moved to the top level`);
    out.push(grow(d));
  }
  return out;
}

function mapConcept(ctx: Ctx, doc: DumpConcept, children: Concept[]): Concept {
  const properties = mapProperties(ctx, `concept "${doc.name}"`, doc.properties);
  const entities = doc.entities.filter(isActive).map((e) => ({
    id: e.id,
    name: String(e.name ?? ''),
    values: mapValues(ctx, `entity "${e.name}"`, e, properties),
  }));
  return { id: doc.id, name: String(doc.name ?? ''), count: entities.length, properties, entities, children };
}

/** How many of a specification: the old tool showed a missing or zero count as 1. */
function mapCount(ctx: Ctx, owner: string, raw: unknown): number {
  if (raw === undefined || raw === null) return 1;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    ctx.warnings.push(`${owner}: count ${String(raw)} is not a valid count; used 1`);
    return 1;
  }
  if (n === 0) {
    ctx.warnings.push(`${owner}: count is 0, which the old tool displayed as 1; used 1`);
    return 1;
  }
  if (!Number.isInteger(n)) ctx.warnings.push(`${owner}: count ${n} is not a whole number; rounded to ${Math.round(n)}`);
  return Math.round(n);
}

/** Specifications carry no name, so a component is named for its first text value, else its position. */
function componentName(props: Property[], values: Record<string, Value>, index: number): string {
  for (const p of props) {
    const v = values[p.id];
    if (p.type.kind === 'text' && typeof v === 'string' && v !== '') return v;
  }
  return `Specification ${index + 1}`;
}

function mapSet(ctx: Ctx, doc: DumpSet, children: ComponentSet[]): ComponentSet {
  const owner = `set "${doc.name}"`;
  const properties = mapProperties(ctx, owner, doc.properties);
  const components: Component[] = doc.specifications.filter(isActive).map((spec, i) => {
    const values = mapValues(ctx, `${owner} specification ${i + 1}`, spec, properties);
    return { id: spec.id, name: componentName(properties, values, i), count: mapCount(ctx, `${owner} specification ${i + 1}`, spec.count), per: [], values };
  });
  return { id: doc.id, name: String(doc.name ?? ''), substitute: '', properties, components, children };
}

export function map(dump: DumpGame): MapResult {
  const concepts = dump.concepts.filter(isActive);
  const ctx: Ctx = {
    warnings: [],
    concepts: new Set(concepts.map((c) => c.id)),
    entities: new Set(concepts.flatMap((c) => c.entities.filter(isActive).map((e) => e.id))),
    imageDocs: new Map(dump.images.map((d) => [d.id, d])),
    files: new Map(),
  };
  const properties = mapProperties(ctx, 'game', dump.properties);
  return {
    game: {
      name: String(dump.doc.name ?? ''),
      properties,
      values: mapValues(ctx, 'game', dump.doc, properties),
      concepts: tree(ctx, 'concept', concepts, (d, kids: Concept[]) => mapConcept(ctx, d, kids)),
      sets: tree(ctx, 'set', dump.sets.filter(isActive), (d, kids: ComponentSet[]) => mapSet(ctx, d, kids)),
    },
    images: [...ctx.files].map(([from, to]) => ({ from, to })),
    warnings: ctx.warnings,
  };
}
