import type { Concept, Entity, Game, Property, Value } from './types.ts';

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
    case 'reference': return null;
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
