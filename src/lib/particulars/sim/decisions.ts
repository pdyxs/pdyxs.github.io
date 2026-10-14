import type { Vec } from '../input/steer';

/** Pure: the force to apply for a steer vector (unit or zero). */
export function thrustFor(steerVec: Vec, strength: number): Vec {
  return { x: steerVec.x * strength, y: steerVec.y * strength };
}

/** Pure: the four wall slabs (centre + half extents) enclosing a width x height box. */
export function wallSlabs(
  width: number,
  height: number,
  thickness: number,
): { cx: number; cy: number; hw: number; hh: number }[] {
  const t = thickness / 2;
  return [
    { cx: 0, cy: -height / 2 - t, hw: width / 2 + thickness, hh: t },
    { cx: 0, cy: height / 2 + t, hw: width / 2 + thickness, hh: t },
    { cx: -width / 2 - t, cy: 0, hw: t, hh: height / 2 },
    { cx: width / 2 + t, cy: 0, hw: t, hh: height / 2 },
  ];
}

/** Pure: how many fixed steps a telegraph of `seconds` lasts. */
export function telegraphTicks(seconds: number, dt: number): number {
  return Math.max(0, Math.round(seconds / dt));
}

/** Pure: a black hole's drawn radius, so its area is proportional to its mass. */
export function blackHoleRadius(mass: number, density: number): number {
  return Math.sqrt(mass / (density * Math.PI));
}

/**
 * Pure: the unit direction a W leaves an emitter in: opposite the steering if
 * any, else opposite the motion, else to the left (Unity: `change()`).
 */
export function bosonDirection(steerVec: Vec, velocity: Vec): Vec {
  for (const v of [steerVec, velocity]) {
    const len = Math.hypot(v.x, v.y);
    if (len > 1e-9) return { x: -v.x / len, y: -v.y / len };
  }
  return { x: -1, y: 0 };
}
