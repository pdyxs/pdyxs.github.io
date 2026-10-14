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
