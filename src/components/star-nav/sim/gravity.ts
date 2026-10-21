import type { Point } from '../types';
import type { Tuning } from './tuning';

/**
 * Softened inverse-square pull toward a planet at the origin of the local
 * frame: a = -mu · p / (|p|² + eps²)^(3/2).
 */
export function acceleration(point: Point, mu: number, tuning: Tuning): Point {
  const eps = tuning.gravitySoftening;
  const d2 = point.x * point.x + point.y * point.y + eps * eps;
  const k = -mu / (d2 * Math.sqrt(d2));
  return { x: k * point.x || 0, y: k * point.y || 0 };
}

/** Position, velocity and heading of the ship in the local frame, at time `t`. */
export type Sample = {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Degrees clockwise from straight up (+y in the local frame). */
  heading: number;
};

export function makeSample(t: number, x: number, y: number, vx: number, vy: number): Sample {
  return { t, x, y, vx, vy, heading: (Math.atan2(vx, vy) * 180) / Math.PI };
}

/** One velocity-Verlet step of length `dt` under the planet's pull. */
export function advance(s: Sample, dt: number, mu: number, tuning: Tuning): Sample {
  const a = acceleration(s, mu, tuning);
  const x = s.x + s.vx * dt + 0.5 * a.x * dt * dt;
  const y = s.y + s.vy * dt + 0.5 * a.y * dt * dt;
  const n = acceleration({ x, y }, mu, tuning);
  return makeSample(
    s.t + dt,
    x,
    y,
    s.vx + 0.5 * (a.x + n.x) * dt,
    s.vy + 0.5 * (a.y + n.y) * dt,
  );
}
