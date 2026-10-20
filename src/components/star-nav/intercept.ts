import type { Planet } from './planet';
import type { Point } from './types';

/**
 * How long a ship at `from`, leaving at `t0` and flying straight at `speed`,
 * needs to meet `planet`. Returns the earliest such flight time, or null if
 * the ship can't catch it within `maxOrbits` of the planet's orbits.
 *
 * Solves |planet(t0 + T) − from| = speed·T. The left side is bounded and the
 * right grows without limit, so a root always exists for speed > 0; but the
 * gap isn't monotonic (the planet can be running away), so we scan for the
 * first sign change and bisect it rather than trusting Newton from T=0.
 */
export function interceptTime(
  planet: Planet,
  t0: number,
  from: Point,
  speed: number,
  maxOrbits = 4,
): number | null {
  const gap = (T: number) => {
    const p = planet.positionAt(t0 + T);
    return Math.hypot(p.x - from.x, p.y - from.y) - speed * T;
  };

  const step = planet.period / 64;
  const limit = planet.period * maxOrbits;

  let lo = 0;
  let gLo = gap(lo);
  if (gLo <= 0) return 0;

  for (let hi = step; hi <= limit; hi += step) {
    const gHi = gap(hi);
    if (gHi <= 0) {
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (gap(mid) > 0) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    }
    lo = hi;
    gLo = gHi;
  }
  return null;
}
