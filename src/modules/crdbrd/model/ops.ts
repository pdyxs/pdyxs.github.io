// Pure edit ops: each takes the whole game and returns a new whole game.
// Ids come from the caller, so ops stay deterministic.

import type { Concept, Entity, Game, Property, PropertyType, Value } from './types.ts';
import { allConcepts } from './query.ts';

/** Rebuild the concept tree, replacing each concept by `fn(concept)`; `fn` returns null to drop it. */
function mapConcepts(list: Concept[], fn: (c: Concept) => Concept | null): Concept[] {
  const out: Concept[] = [];
  for (const c of list) {
    const next = fn(c);
    if (next) out.push({ ...next, children: mapConcepts(next.children, fn) });
  }
  return out;
}

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
  return stripProperties(next, (p) => p.type.kind === 'reference' && gone.has(p.type.concept));
}

/** Drop every property matching `doomed`, from the game and every concept, along with its values. */
function stripProperties(game: Game, doomed: (p: Property) => boolean): Game {
  const ids = new Set([...game.properties, ...allConcepts(game).flatMap((c) => c.properties)].filter(doomed).map((p) => p.id));
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
  };
}

/** Apply `fn` to the property with `id`, wherever it lives. */
function mapProperty(game: Game, id: string, fn: (p: Property) => Property): Game {
  const map = (list: Property[]) => list.map((p) => (p.id === id ? fn(p) : p));
  return {
    ...game,
    properties: map(game.properties),
    concepts: mapConcepts(game.concepts, (c) => ({ ...c, properties: map(c.properties) })),
  };
}

/** Add a property to concept `owner`, or to the game when there is no owner. */
export function addProperty(game: Game, args: { id: string; name: string; type?: PropertyType; owner?: string }): Game {
  const property: Property = { id: args.id, name: args.name, type: args.type ?? { kind: 'text' } };
  if (!args.owner) return { ...game, properties: [...game.properties, property] };
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
  return clearReferences(mapEntity(game, id, () => null), new Set([id]));
}

export function setEntityValue(game: Game, entity: string, property: string, value: Value): Game {
  return mapEntity(game, entity, (e) => ({ ...e, values: { ...e.values, [property]: value } }));
}

export function setGameValue(game: Game, property: string, value: Value): Game {
  return { ...game, values: { ...game.values, [property]: value } };
}

/** Drop stored values that point at any of `targets` (entity ids). */
function clearReferences(game: Game, targets: Set<string>): Game {
  const refs = new Set([...game.properties, ...allConcepts(game).flatMap((c) => c.properties)].filter((p) => p.type.kind === 'reference').map((p) => p.id));
  const keepRefs = (values: Game['values']) => Object.fromEntries(Object.entries(values).filter(([k, v]) => !(refs.has(k) && typeof v === 'string' && targets.has(v))));
  return {
    ...game,
    values: keepRefs(game.values),
    concepts: mapConcepts(game.concepts, (c) => ({ ...c, entities: c.entities.map((e) => ({ ...e, values: keepRefs(e.values) })) })),
  };
}

export function removeProperty(game: Game, id: string): Game {
  return stripProperties(game, (p) => p.id === id);
}

export function renameGame(game: Game, name: string): Game {
  return { ...game, name };
}
