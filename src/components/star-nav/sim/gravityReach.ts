import type { Point } from '../types';
import { acceleration, type Sample } from './gravity';
import type { Side } from './steering';
import type { Tuning } from './tuning';

const RAD = Math.PI / 180;
// Longer than the viewBox diagonal, so a reach shape always runs off the edge.
const REACH_LENGTH = 20;
const MAX_POINTS = 4000;
const MAX_STEP = 0.02;
// Steps shrink near the planet, in proportion to the distance from it.
const NEAR_STEP = 0.04;
const NEAR_SOFTENING = 0.15;

/**
 * The path of a ship steering at full lock towards `side` until it has turned
 * `turnCap`, then coasting, `length` of path in all, with the planet's pull
 * (parameter `mu`, planet at the origin) acting throughout. Local frame.
 */
function extreme(start: Sample, side: Side, mu: number, tuning: Tuning, length: number): Point[] {
  const sign = side === 'right' ? 1 : -1;
  const R = tuning.turnRadius;
  let { x, y, vx, vy } = start;
  const tau = (tuning.turnCap * RAD * R) / Math.hypot(vx, vy);
  const points: Point[] = [{ x, y }];
  let t = 0;
  let travelled = 0;
  while (travelled < length && points.length < MAX_POINTS) {
    const speed = Math.hypot(vx, vy);
    const dt = Math.min(MAX_STEP, (NEAR_STEP * (Math.hypot(x, y) + NEAR_SOFTENING)) / speed);
    if (t < tau) {
      const d = Math.min(dt, tau - t);
      const phi = sign * (speed / R) * d;
      const c = Math.cos(phi), s = Math.sin(phi);
      [vx, vy] = [vx * c + vy * s, -vx * s + vy * c];
    }
    x += vx * dt;
    y += vy * dt;
    travelled += speed * dt;
    t += dt;
    const a = acceleration({ x, y }, mu, tuning);
    vx += a.x * dt;
    vy += a.y * dt;
    points.push({ x, y });
  }
  return points;
}

/**
 * The reach shape of a ship at `start` (local frame) while the planet keeps
 * pulling: the full-left path out, then the full-right path back.
 */
export function gravityReachShape(start: Sample, mu: number, tuning: Tuning): Point[] {
  const left = extreme(start, 'left', mu, tuning, REACH_LENGTH);
  const right = extreme(start, 'right', mu, tuning, REACH_LENGTH);
  return [...left, ...right.reverse().slice(0, -1)];
}
