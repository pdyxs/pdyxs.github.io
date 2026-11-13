// Pure edit ops: each takes the whole game and returns a new whole game.
// Ids come from the caller, so ops stay deterministic.

import type { Binding, Box, ImageSlots, Layer, Outline, LayerType, Prop, Component, ComponentSet, Concept, Entity, Game, Property, PropertyType, Value } from './types.ts';
import { bindingKey, keyEntities } from './image.ts';
import { outlineProblem } from './path.ts';
import { allConcepts, allProperties, allSets, geometryOf, setsOf, templateOf } from './query.ts';

/** Rebuild the concept tree, replacing each concept by `fn(concept)`; `fn` returns null to drop it. */
function mapConcepts(list: Concept[], fn: (c: Concept) => Concept | null): Concept[] {
  const out: Concept[] = [];
  for (const c of list) {
    const next = fn(c);
    if (next) out.push({ ...next, children: mapConcepts(next.children, fn) });
  }
  return out;
}

/** Rebuild the set tree, replacing each set by `fn(set)`; `fn` returns null to drop it. */
function mapSets(list: ComponentSet[], fn: (s: ComponentSet) => ComponentSet | null): ComponentSet[] {
  const out: ComponentSet[] = [];
  for (const s of list) {
    const next = fn(s);
    if (next) out.push({ ...next, children: mapSets(next.children, fn) });
  }
  return out;
}

const withSets = (game: Game, sets: ComponentSet[]): Game => ({ ...game, sets });
const mapAllSets = (game: Game, fn: (s: ComponentSet) => ComponentSet | null): Game => (game.sets ? withSets(game, mapSets(game.sets, fn)) : game);

const withConcepts = (game: Game, concepts: Concept[]): Game => ({ ...game, concepts });

export function addConcept(game: Game, args: { id: string; name: string; parent?: string }): Game {
  const concept: Concept = { id: args.id, name: args.name, count: 1, properties: [], entities: [], children: [] };
  if (!args.parent) return withConcepts(game, [...game.concepts, concept]);
  return withConcepts(game, mapConcepts(game.concepts, (c) => (c.id === args.parent ? { ...c, children: [...c.children, concept] } : c)));
}

export function renameConcept(game: Game, id: string, name: string): Game {
  return withConcepts(game, mapConcepts(game.concepts, (c) => (c.id === id ? { ...c, name } : c)));
}

export function removeConcept(game: Game, id: string): Game {
  const doomed = allConcepts(game).find((c) => c.id === id);
  const gone = new Set(doomed ? allConcepts({ ...game, concepts: [doomed] }).map((c) => c.id) : []);
  const next = withConcepts(game, mapConcepts(game.concepts, (c) => (c.id === id ? null : c)));
  const stripped = stripProperties(next, (p) => p.type.kind === 'reference' && gone.has(p.type.concept));
  const unvaried = [...gone].reduce((g, concept) => dropVariesBy(g, concept), stripped);
  return mapAllSets(unvaried, (set) => ({ ...set, components: set.components.map((c) => ({ ...c, per: c.per.filter((id) => !gone.has(id)) })) }));
}

/** Drop every property matching `doomed`, from the game and every concept, along with its values. */
function stripProperties(game: Game, doomed: (p: Property) => boolean): Game {
  const ids = new Set(allProperties(game).filter(doomed).map((p) => p.id));
  if (ids.size === 0) return game;
  const keep = (list: Property[]) => list.filter((p) => !ids.has(p.id));
  const keepValues = (values: Game['values']) => Object.fromEntries(Object.entries(values).filter(([k]) => !ids.has(k)));
  return {
    ...game,
    properties: keep(game.properties),
    values: keepValues(game.values),
    concepts: mapConcepts(game.concepts, (c) => ({
      ...c,
      properties: keep(c.properties),
      entities: c.entities.map((e) => ({ ...e, values: keepValues(e.values) })),
    })),
    ...(game.sets && {
      sets: mapSets(game.sets, (s) => ({
        ...s,
        properties: keep(s.properties),
        components: s.components.map((c) => ({ ...c, values: keepValues(c.values) })),
      })),
    }),
  };
}

/** Apply `fn` to the property with `id`, wherever it lives. */
function mapProperty(game: Game, id: string, fn: (p: Property) => Property): Game {
  const map = (list: Property[]) => list.map((p) => (p.id === id ? fn(p) : p));
  return {
    ...game,
    properties: map(game.properties),
    concepts: mapConcepts(game.concepts, (c) => ({ ...c, properties: map(c.properties) })),
    ...(game.sets && { sets: mapSets(game.sets, (s) => ({ ...s, properties: map(s.properties) })) }),
  };
}

/** Add a property to concept or set `owner`, or to the game when there is no owner. */
export function addProperty(game: Game, args: { id: string; name: string; type?: PropertyType; owner?: string }): Game {
  const property: Property = { id: args.id, name: args.name, type: args.type ?? { kind: 'text' } };
  if (!args.owner) return { ...game, properties: [...game.properties, property] };
  if (allSets(game).some((s) => s.id === args.owner)) {
    return mapAllSets(game, (s) => (s.id === args.owner ? { ...s, properties: [...s.properties, property] } : s));
  }
  return withConcepts(game, mapConcepts(game.concepts, (c) => (c.id === args.owner ? { ...c, properties: [...c.properties, property] } : c)));
}

export function renameProperty(game: Game, id: string, name: string): Game {
  return mapProperty(game, id, (p) => ({ ...p, name }));
}

/** Changing a type drops the stored values: they were written for the old one. */
export function setPropertyType(game: Game, id: string, type: PropertyType): Game {
  return dropValues(mapProperty(game, id, (p) => ({ ...p, type })), (pid) => pid === id);
}

function dropValues(game: Game, drop: (propertyId: string) => boolean): Game {
  const keep = (values: Game['values']) => Object.fromEntries(Object.entries(values).filter(([k]) => !drop(k)));
  return {
    ...game,
    values: keep(game.values),
    concepts: mapConcepts(game.concepts, (c) => ({ ...c, entities: c.entities.map((e) => ({ ...e, values: keep(e.values) })) })),
    ...(game.sets && { sets: mapSets(game.sets, (s) => ({ ...s, components: s.components.map((c) => ({ ...c, values: keep(c.values) })) })) }),
  };
}

function mapEntity(game: Game, id: string, fn: (e: Entity) => Entity | null): Game {
  return withConcepts(game, mapConcepts(game.concepts, (c) => ({
    ...c,
    entities: c.entities.flatMap((e) => (e.id === id ? fn(e) ?? [] : [e])),
  })));
}

export function addEntity(game: Game, args: { concept: string; id: string; name: string }): Game {
  const entity: Entity = { id: args.id, name: args.name, values: {} };
  return withConcepts(game, mapConcepts(game.concepts, (c) => (c.id === args.concept ? { ...c, entities: [...c.entities, entity] } : c)));
}

export function renameEntity(game: Game, id: string, name: string): Game {
  return mapEntity(game, id, (e) => ({ ...e, name }));
}

/** Removing an entity also clears every stored reference to it. */
export function removeEntity(game: Game, id: string): Game {
  const targets = new Set([id]);
  return clearSlots(clearReferences(mapEntity(game, id, () => null), targets), targets);
}

export function setEntityValue(game: Game, entity: string, property: string, value: Value): Game {
  return mapEntity(game, entity, (e) => ({ ...e, values: { ...e.values, [property]: value } }));
}

export function setGameValue(game: Game, property: string, value: Value): Game {
  return { ...game, values: { ...game.values, [property]: value } };
}

/** Drop stored values that point at any of `targets` (entity ids). */
function clearReferences(game: Game, targets: Set<string>): Game {
  const refs = new Set(allProperties(game).filter((p) => p.type.kind === 'reference').map((p) => p.id));
  const keepRefs = (values: Game['values']) => Object.fromEntries(Object.entries(values).filter(([k, v]) => !(refs.has(k) && typeof v === 'string' && targets.has(v))));
  return {
    ...game,
    values: keepRefs(game.values),
    concepts: mapConcepts(game.concepts, (c) => ({ ...c, entities: c.entities.map((e) => ({ ...e, values: keepRefs(e.values) })) })),
    ...(game.sets && { sets: mapSets(game.sets, (s) => ({ ...s, components: s.components.map((c) => ({ ...c, values: keepRefs(c.values) })) })) }),
  };
}

/** Stop every image property varying by `concept`, clearing its values (they were keyed by that concept). */
function dropVariesBy(game: Game, concept: string): Game {
  const varying = allProperties(game).filter((p) => p.type.kind === 'image' && p.type.variesBy === concept);
  return varying.reduce((g, p) => setImageVariesBy(g, p.id, null), game);
}

/**
 * Declare that image property `id` varies by `concept` (or by nothing, with
 * null). A different declaration clears the stored values: plain filenames and
 * slots keyed for another concept do not carry over, and none is left orphaned.
 */
export function setImageVariesBy(game: Game, id: string, concept: string | null): Game {
  const property = allProperties(game).find((p) => p.id === id);
  if (!property || property.type.kind !== 'image' || (property.type.variesBy ?? null) === concept) return game;
  return setPropertyType(game, id, concept ? { kind: 'image', variesBy: concept } : { kind: 'image' });
}

/** Set (or with null clear) the image `entity` holds for `property` when `bound` is the entity of the varies-by concept. */
export function setImageSlot(game: Game, entity: string, property: string, bound: string, file: string | null): Game {
  const concept = allProperties(game).find((p) => p.id === property)?.type;
  if (!concept || concept.kind !== 'image' || !concept.variesBy) return game;
  const key = bindingKey({ [concept.variesBy]: bound });
  return mapEntity(game, entity, (e) => {
    const slots = { ...(typeof e.values[property] === 'object' && e.values[property] !== null ? (e.values[property] as ImageSlots) : {}) };
    if (file === null) delete slots[key];
    else slots[key] = file;
    const { [property]: _old, ...rest } = e.values;
    return { ...e, values: Object.keys(slots).length ? { ...rest, [property]: slots } : rest };
  });
}

/** Drop the slots of every varying image that name any of `targets` (entity ids). */
function clearSlots(game: Game, targets: Set<string>): Game {
  const varying = new Set(allProperties(game).filter((p) => p.type.kind === 'image' && p.type.variesBy).map((p) => p.id));
  const prune = (values: Game['values']): Game['values'] =>
    Object.fromEntries(
      Object.entries(values).flatMap(([k, v]) => {
        if (!varying.has(k) || typeof v !== 'object' || v === null) return [[k, v]];
        const kept = Object.fromEntries(Object.entries(v).filter(([key]) => !keyEntities(key).some((id) => targets.has(id))));
        return Object.keys(kept).length ? [[k, kept]] : [];
      }),
    );
  return {
    ...game,
    concepts: mapConcepts(game.concepts, (c) => ({ ...c, entities: c.entities.map((e) => ({ ...e, values: prune(e.values) })) })),
  };
}

export function removeProperty(game: Game, id: string): Game {
  return stripProperties(game, (p) => p.id === id);
}

export function renameGame(game: Game, name: string): Game {
  return { ...game, name };
}

// ---- component sets and components ----

export function addSet(game: Game, args: { id: string; name: string; parent?: string }): Game {
  const set: ComponentSet = { id: args.id, name: args.name, substitute: '', properties: [], components: [], children: [] };
  if (!args.parent) return withSets(game, [...setsOf(game), set]);
  return mapAllSets(game, (s) => (s.id === args.parent ? { ...s, children: [...s.children, set] } : s));
}

export function renameSet(game: Game, id: string, name: string): Game {
  return mapAllSets(game, (s) => (s.id === id ? { ...s, name } : s));
}

export function setSubstitute(game: Game, id: string, substitute: string): Game {
  return mapAllSets(game, (s) => (s.id === id ? { ...s, substitute } : s));
}

export function removeSet(game: Game, id: string): Game {
  return mapAllSets(game, (s) => (s.id === id ? null : s));
}

export function addComponent(game: Game, args: { set: string; id: string; name: string }): Game {
  const component: Component = { id: args.id, name: args.name, count: 1, per: [], values: {} };
  return mapAllSets(game, (s) => (s.id === args.set ? { ...s, components: [...s.components, component] } : s));
}

function mapComponent(game: Game, id: string, fn: (c: Component) => Component | null): Game {
  return mapAllSets(game, (s) => ({ ...s, components: s.components.flatMap((c) => (c.id === id ? fn(c) ?? [] : [c])) }));
}

export function renameComponent(game: Game, id: string, name: string): Game {
  return mapComponent(game, id, (c) => ({ ...c, name }));
}

export function removeComponent(game: Game, id: string): Game {
  return mapComponent(game, id, () => null);
}

/** Counts are whole numbers, never negative. */
export function setComponentCount(game: Game, id: string, count: number): Game {
  const whole = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return mapComponent(game, id, (c) => ({ ...c, count: whole }));
}

/** Add `concept` to the component's per-list; a concept already there stays once. */
export function addPer(game: Game, component: string, concept: string): Game {
  return mapComponent(game, component, (c) => (c.per.includes(concept) ? c : { ...c, per: [...c.per, concept] }));
}

export function removePer(game: Game, component: string, concept: string): Game {
  return mapComponent(game, component, (c) => ({ ...c, per: c.per.filter((id) => id !== concept) }));
}

export function setComponentValue(game: Game, component: string, property: string, value: Value): Game {
  return mapComponent(game, component, (c) => ({ ...c, values: { ...c.values, [property]: value } }));
}

// ---- set geometry ----

const positive = (n: number) => Number.isFinite(n) && n > 0;
const nonNegative = (n: number) => Number.isFinite(n) && n >= 0;

/** A size must be positive on both sides; anything else leaves the set as it was. */
export function setSetSize(game: Game, id: string, size: { width: number; height: number }): Game {
  if (!positive(size.width) || !positive(size.height)) return game;
  return mapAllSets(game, (s) => (s.id === id ? { ...s, size: { width: size.width, height: size.height } } : s));
}

export function setSetBleed(game: Game, id: string, bleed: number): Game {
  if (!nonNegative(bleed)) return game;
  return mapAllSets(game, (s) => (s.id === id ? { ...s, bleed } : s));
}

/** Any outline shape. A malformed custom path is kept (the user is mid-edit) and reported by `validate`; a malformed shape is refused. */
export function setOutline(game: Game, id: string, outline: Outline): Game {
  if (outlineProblem(outline) === 'outline') return game;
  return mapAllSets(game, (s) => (s.id === id ? { ...s, outline } : s));
}

export function setOutlineRadius(game: Game, id: string, radius: number): Game {
  if (!nonNegative(radius)) return game;
  return mapAllSets(game, (s) => (s.id === id ? { ...s, outline: { kind: 'rectangle', radius } } : s));
}

// ---- template layers ----

const lit = <T>(value: T): Prop<T> => ({ kind: 'literal', value });

function newLayer(type: LayerType, id: string, box: Box): Layer {
  switch (type) {
    case 'shape':
      return { id, type, ...box, shape: 'rect', fill: lit('#cccccc'), stroke: lit(null), strokeWidth: lit(0.3) };
    case 'text':
      return { id, type, ...box, text: lit('Text'), size: lit(4), colour: lit('#000000'), align: lit('left') };
    case 'image':
      return { id, type, ...box, file: lit(null), fit: lit('cover') };
  }
}

function mapLayers(game: Game, fn: (layers: Layer[]) => Layer[], setId?: string): Game {
  return mapAllSets(game, (s) => (setId === undefined || s.id === setId ? { ...s, template: fn(templateOf(s)) } : s));
}

/** Add a layer covering the whole card; it goes on top of the draw order. */
export function addLayer(game: Game, args: { set: string; id: string; type: LayerType }): Game {
  const set = allSets(game).find((s) => s.id === args.set);
  if (!set) return game;
  const { size } = geometryOf(set);
  return mapLayers(game, (layers) => [...layers, newLayer(args.type, args.id, { x: 0, y: 0, width: size.width, height: size.height })], args.set);
}

export function removeLayer(game: Game, id: string): Game {
  return mapLayers(game, (layers) => layers.filter((l) => l.id !== id));
}

/** Move a layer by `delta` places in the draw order (negative is toward the back); the ends hold. */
export function moveLayer(game: Game, id: string, delta: number): Game {
  return mapLayers(game, (layers) => {
    const from = layers.findIndex((l) => l.id === id);
    const to = from + Math.sign(delta);
    if (from < 0 || to < 0 || to >= layers.length) return layers;
    const next = [...layers];
    [next[from], next[to]] = [next[to], next[from]];
    return next;
  });
}

function mapLayer(game: Game, id: string, fn: (l: Layer) => Layer): Game {
  return mapLayers(game, (layers) => layers.map((l) => (l.id === id ? fn(l) : l)));
}

/** Edit a layer's position or size in mm; a value that is not finite, or a size that is not positive, is ignored. */
export function setLayerBox(game: Game, id: string, box: Partial<Box>): Game {
  const ok = (key: keyof Box, v: number | undefined): v is number => v !== undefined && Number.isFinite(v) && (key === 'x' || key === 'y' || v > 0);
  return mapLayer(game, id, (l) => {
    const next = { ...l };
    for (const key of ['x', 'y', 'width', 'height'] as const) if (ok(key, box[key])) next[key] = box[key]!;
    return next;
  });
}

/** Set a layer's literal prop (`fill`, `text`, `file`, ...); a name the layer does not have is ignored. */
export function setLayerProp(game: Game, id: string, key: string, value: unknown): Game {
  const target = allSets(game).flatMap(templateOf).find((l) => l.id === id) as Record<string, unknown> | undefined;
  const current = target?.[key] as { kind?: string } | undefined;
  if (!current?.kind) return game;
  return mapLayer(game, id, (l) => ({ ...l, [key]: lit(value) }) as Layer);
}

/** Bind a layer prop to a model source; a name the layer does not have is ignored. */
export function bindLayerProp(game: Game, id: string, key: string, source: Binding): Game {
  const target = allSets(game).flatMap(templateOf).find((l) => l.id === id) as Record<string, unknown> | undefined;
  if (!(target?.[key] as { kind?: string } | undefined)?.kind) return game;
  return mapLayer(game, id, (l) => ({ ...l, [key]: { kind: 'bound', source } }) as Layer);
}

/** Turn a bound prop back into a literal, at the value a new layer of that type starts with. */
export function unbindLayerProp(game: Game, id: string, key: string): Game {
  const target = allSets(game).flatMap(templateOf).find((l) => l.id === id);
  const fresh = target && (newLayer(target.type, id, target) as unknown as Record<string, unknown>)[key];
  if (!fresh) return game;
  return mapLayer(game, id, (l) => ({ ...l, [key]: fresh }) as Layer);
}

export function setShapeKind(game: Game, id: string, shape: 'rect' | 'ellipse'): Game {
  return mapLayer(game, id, (l) => (l.type === 'shape' ? { ...l, shape } : l));
}
