import { EXPLOSION_RADIUS_MULT, EXPLOSION_SECONDS, EXPLOSION_STRENGTH, FIXED_DT } from '../constants';
import type { Vec } from '../input/steer';

/** An explosion's shape: where, how big its source was, and how long it has been going. */
export interface ExplosionShape {
  x: number;
  y: number;
  /** Radius it starts at (the player's own size for a player explosion, zero for an annihilation). */
  initial: number;
  /** The exploder's size, which sets how far it reaches. */
  size: number;
  /** Seconds since it began. */
  age: number;
}

export const maxRadius = (e: Pick<ExplosionShape, 'initial' | 'size'>): number => e.initial + EXPLOSION_RADIUS_MULT * e.size;

/** Pure: the radius grows as sqrt(time), reaching its maximum after EXPLOSION_SECONDS. */
export function explosionRadius(e: ExplosionShape): number {
  return e.initial + ((maxRadius(e) - e.initial) / Math.sqrt(EXPLOSION_SECONDS)) * Math.sqrt(e.age);
}

export const explosionDone = (e: ExplosionShape): boolean => explosionRadius(e) > maxRadius(e);

/** Pure: the force an explosion puts on a particle at `at` (zero outside it, or before it has grown). */
export function explosionPush(e: ExplosionShape, at: Vec): Vec {
  const r = explosionRadius(e);
  if (r <= 0 || explosionDone(e)) return { x: 0, y: 0 };
  const dx = at.x - e.x;
  const dy = at.y - e.y;
  const d = Math.hypot(dx, dy);
  if (d >= r || d === 0) return { x: 0, y: 0 };
  const amount = (EXPLOSION_STRENGTH * FIXED_DT) / Math.sqrt(r);
  return { x: (dx / d) * amount, y: (dy / d) * amount };
}
