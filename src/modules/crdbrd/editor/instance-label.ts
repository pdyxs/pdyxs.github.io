import type { Instance } from '../model/expand.ts';
import type { Game } from '../model/types.ts';
import { allConcepts, findComponent } from '../model/query.ts';

/** How the instance picker names a piece: its component, then the entities it is bound to, e.g. `Card (Red, Run)`. */
export function instanceLabel(game: Game, instance: Instance): string {
  const name = findComponent(game, instance.component)?.name ?? instance.component;
  const entities = allConcepts(game).flatMap((c) => c.entities);
  const bound = Object.values(instance.bound).map((id) => entities.find((e) => e.id === id)?.name ?? id);
  return bound.length ? `${name} (${bound.join(', ')})` : name;
}
