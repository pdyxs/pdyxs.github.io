// imageFor: the one place a varies-by image is resolved. Pure.

import type { Game, ImageSlots, Value } from './types.ts';
import { allConcepts, allProperties, findComponent, findConcept } from './query.ts';

/** Whose value to read: an entity or a component by id, or the game itself. */
export type OwnerRef = { entity: string } | { component: string } | 'game';

export type ImageResult = { file: string } | { gap: string };

/**
 * The key a varies-by value stores a slot under. `bindings` maps concept id to
 * entity id; the key lists them sorted by concept, so one concept gives
 * `player=red` today and several give `era=1&player=red` later, same shape.
 */
export function bindingKey(bindings: Record<string, string>): string {
  return Object.entries(bindings)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([concept, entity]) => `${concept}=${entity}`)
    .join('&');
}

/** The entity ids a binding key names. */
export function keyEntities(key: string): string[] {
  return key.split('&').map((pair) => pair.slice(pair.indexOf('=') + 1));
}

function valuesOf(game: Game, ref: OwnerRef): Record<string, Value> | undefined {
  if (ref === 'game') return game.values;
  if ('entity' in ref) return allConcepts(game).flatMap((c) => c.entities).find((e) => e.id === ref.entity)?.values;
  return findComponent(game, ref.component)?.values;
}

const isSlots = (v: Value | undefined): v is ImageSlots => typeof v === 'object' && v !== null;

/**
 * The image `ref` holds for `propertyId`, given `bindings` (concept id to
 * entity id, the shape an `expand` instance carries in `bound`). A missing
 * value, binding or combination is a gap with a reason, never a throw.
 */
export function imageFor(game: Game, ref: OwnerRef, propertyId: string, bindings: Record<string, string>): ImageResult {
  const property = allProperties(game).find((p) => p.id === propertyId);
  if (!property) return { gap: 'no such property' };
  if (property.type.kind !== 'image') return { gap: 'not an image property' };
  const values = valuesOf(game, ref);
  if (!values) return { gap: 'no such owner' };
  const value = values[propertyId];

  const concept = property.type.variesBy;
  if (!concept) return typeof value === 'string' && value ? { file: value } : { gap: 'no image set' };

  const bound = bindings[concept];
  if (bound === undefined) return { gap: `not bound to ${concept}` };
  if (!findConcept(game, concept)?.entities.some((e) => e.id === bound)) return { gap: `no such ${concept} entity ${bound}` };
  const file = isSlots(value) ? value[bindingKey({ [concept]: bound })] : undefined;
  return file ? { file } : { gap: `no image for ${concept} ${bound}` };
}
