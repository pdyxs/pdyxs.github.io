import type { Component, ComponentSet, Concept, Entity, Game, Layer, Outline, Property, Value } from './types.ts';

/** Every concept in the game, depth-first, parents before children. */
export function allConcepts(game: Game): Concept[] {
  const out: Concept[] = [];
  const walk = (list: Concept[]) => list.forEach((c) => { out.push(c); walk(c.children); });
  walk(game.concepts);
  return out;
}

export function findConcept(game: Game, id: string): Concept | undefined {
  return allConcepts(game).find((c) => c.id === id);
}

/** The value an entity holds for a property, or the type's default when none is stored. */
export function valueOf(entity: Pick<Entity, 'name' | 'values'>, property: Property): Value {
  if (property.id in entity.values) return entity.values[property.id];
  switch (property.type.kind) {
    case 'number': return property.type.min;
    case 'text': return `(${entity.name})`;
    case 'colour': return '#000000';
    case 'boolean': return false;
    case 'reference':
    case 'image': return null;
  }
}

/** The chain of concepts from a top-level one down to `id` inclusive; empty if `id` is not in the game. */
export function conceptPath(game: Game, id: string): Concept[] {
  const walk = (list: Concept[], trail: Concept[]): Concept[] => {
    for (const c of list) {
      if (c.id === id) return [...trail, c];
      const found = walk(c.children, [...trail, c]);
      if (found.length) return found;
    }
    return [];
  };
  return walk(game.concepts, []);
}

/** The game's top-level sets; games saved before sets existed have none. */
export const setsOf = (game: Game): ComponentSet[] => game.sets ?? [];

/** Every set in the game, depth-first, parents before children. */
export function allSets(game: Game): ComponentSet[] {
  const out: ComponentSet[] = [];
  const walk = (list: ComponentSet[]) => list.forEach((s) => { out.push(s); walk(s.children); });
  walk(setsOf(game));
  return out;
}

export function findSet(game: Game, id: string): ComponentSet | undefined {
  return allSets(game).find((s) => s.id === id);
}

export function findComponent(game: Game, id: string): Component | undefined {
  return allSets(game).flatMap((s) => s.components).find((c) => c.id === id);
}

/** The chain of sets from a top-level one down to `id` inclusive; empty if `id` is not in the game. */
export function setPath(game: Game, id: string): ComponentSet[] {
  const walk = (list: ComponentSet[], trail: ComponentSet[]): ComponentSet[] => {
    for (const s of list) {
      if (s.id === id) return [...trail, s];
      const found = walk(s.children, [...trail, s]);
      if (found.length) return found;
    }
    return [];
  };
  return walk(setsOf(game), []);
}

/** Every property in the game, whoever holds it. */
export const allProperties = (game: Game): Property[] => [...game.properties, ...allConcepts(game).flatMap((c) => c.properties), ...allSets(game).flatMap((s) => s.properties)];

/** Defaults for a set that has no geometry yet: a poker card, no bleed. */
export const DEFAULT_SIZE = { width: 63.5, height: 88.9 };

/** A set's physical geometry with defaults filled in, so older games read as a plain card. */
export function geometryOf(set: Pick<ComponentSet, 'size' | 'bleed' | 'outline'>): { size: { width: number; height: number }; bleed: number; outline: Outline } {
  return { size: set.size ?? DEFAULT_SIZE, bleed: set.bleed ?? 0, outline: set.outline ?? { kind: 'rectangle' } };
}

export const templateOf = (set: ComponentSet): Layer[] => set.template ?? [];
