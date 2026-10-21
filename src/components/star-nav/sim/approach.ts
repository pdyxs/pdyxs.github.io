import type { Planet } from '../planet';
import type { Point, Pose } from '../types';
import { steerPath, steeringTo } from './steering';
import type { Tuning } from './tuning';

export type Approach = {
  /** Points of the arc then the straight leg, ship to planet. */
  route: Point[];
  arrivalTime: number;
  /** Where the ship is, and which way it faces, on arrival. */
  arrivalPose: Pose;
};

/**
 * The earliest approach to `planet` for a ship at `pose` at orbit time
 * `time`: the arrival time t at which a steering plan of length
 * shipSpeed·(t − time) ends exactly on planet.positionAt(t). Null if there is
 * none within `maxOrbits` of the planet's orbits (not visitable).
 *
 * Like a straight intercept, the gap (path length needed − path length
 * flown) isn't monotonic in t, so scan for the first step where it crosses
 * from positive to non-positive and bisect there. Where the planet is
 * outside the reach shape no plan exists, and counts as a positive gap.
 */
export function planApproach(
  pose: Pose,
  time: number,
  planet: Planet,
  tuning: Tuning,
  maxOrbits = 4,
): Approach | null {
  const needed = (T: number) => steeringTo(pose, planet.positionAt(time + T), tuning)?.length ?? null;
  const gap = (T: number) => {
    const n = needed(T);
    return n === null ? Infinity : n - tuning.shipSpeed * T;
  };

  const step = planet.period / 128;
  const limit = planet.period * maxOrbits;

  let lo = 0;
  for (let hi = step; hi <= limit; hi += step) {
    if (gap(lo) > 0 && gap(hi) <= 0) {
      let a = lo, b = hi;
      for (let i = 0; i < 50; i++) {
        const mid = (a + b) / 2;
        if (gap(mid) > 0) a = mid; else b = mid;
      }
      // a flip at the edge of the reach shape is not an arrival
      if (Math.abs(gap(b)) < 1e-3) return build(b);
    }
    lo = hi;
  }
  return null;

  function build(T: number): Approach {
    const target = planet.positionAt(time + T);
    const plan = steeringTo(pose, target, tuning)!;
    const route = steerPath(pose, plan.side, plan.turnAmount, tuning, plan.length);
    route[route.length - 1] = { ...target };
    const heading = pose.heading + (plan.side === 'right' ? 1 : -1) * plan.turnAmount;
    return {
      route,
      arrivalTime: time + T,
      arrivalPose: { x: target.x, y: target.y, heading },
    };
  }
}
