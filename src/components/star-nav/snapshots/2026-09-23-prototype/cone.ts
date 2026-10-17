import type { Point } from "./types";

/**
 * SVG path for a sector with its apex at the origin, pointing up (−y),
 * spanning `angle` degrees symmetrically about that axis and reaching
 * `length` units out. Rotate/translate it into place with a transform.
 */
export function conePath(angle: number, length: number): string {
  const half = (Math.min(angle, 359.9) * Math.PI) / 360;
  const x = length * Math.sin(half);
  const y = -length * Math.cos(half);
  const largeArc = angle > 180 ? 1 : 0;
  return `M 0 0 L ${-x} ${y} A ${length} ${length} 0 ${largeArc} 1 ${x} ${y} Z`;
}

/**
 * Whether `point` lies inside the cone that `conePath(angle, length)` draws
 * when placed with its apex at `apex` and rotated to `heading` (degrees
 * clockwise from straight up, as the ship's is).
 */
export function inCone(
  apex: Point,
  heading: number,
  angle: number,
  length: number,
  point: Point,
): boolean {
  const dx = point.x - apex.x;
  const dy = point.y - apex.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return true;
  if (dist > length) return false;

  const h = (heading * Math.PI) / 180;
  // unit vector along the heading; up is −y
  const cosBetween = (dx * Math.sin(h) + dy * -Math.cos(h)) / dist;
  return cosBetween >= Math.cos((angle * Math.PI) / 360);
}
