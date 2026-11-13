// expand: the single source for "what physical pieces exist". Pure.

import type { Game, Value } from './types.ts';
import { findConcept, findSet, valueOf } from './query.ts';

export interface Instance {
  /** The component this instance came from. */
  component: string;
  /** Position among that component's instances, from 0. */
  index: number;
  /** The entity bound for each per-concept, keyed by concept id. */
  bound: Record<string, string>;
  /** The set's properties resolved for this component, keyed by property id. */
  values: Record<string, Value>;
}

/**
 * The instances of a set's own components (nested sets expand on their own).
 * Order: components as listed; within one, the per-concepts as listed with the
 * first varying slowest, then `count` copies of each combination. A per-concept
 * with no entities yields no instances.
 */
export function expand(game: Game, setId: string): Instance[] {
  const set = findSet(game, setId);
  if (!set) return [];
  const out: Instance[] = [];
  for (const component of set.components) {
    const values = Object.fromEntries(set.properties.map((p) => [p.id, valueOf({ name: component.name, values: component.values }, p)]));
    let combos: Record<string, string>[] = [{}];
    for (const conceptId of component.per) {
      const entities = findConcept(game, conceptId)?.entities ?? [];
      combos = combos.flatMap((bound) => entities.map((e) => ({ ...bound, [conceptId]: e.id })));
    }
    let index = 0;
    for (const bound of combos) {
      for (let n = 0; n < component.count; n++) out.push({ component: component.id, index: index++, bound, values: { ...values } });
    }
  }
  return out;
}
