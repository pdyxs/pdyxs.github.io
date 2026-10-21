import type { Point, Pose } from '../types';

/** Heading (degrees clockwise from straight up) of the vector from→to. */
export function headingBetween(from: Point, to: Point): number {
  return (Math.atan2(to.x - from.x, -(to.y - from.y)) * 180) / Math.PI;
}

/**
 * The first `fraction` (0-1) of a polyline by length: the points up to there,
 * and the pose at the end, facing along the leg it is on.
 */
export function routeUpTo(route: Point[], fraction: number): { points: Point[]; pose: Pose } {
  const lengths = route.slice(1).map((p, i) => Math.hypot(p.x - route[i].x, p.y - route[i].y));
  const total = lengths.reduce((s, l) => s + l, 0);
  let remaining = Math.min(1, Math.max(0, fraction)) * total;

  const points = [route[0]];
  let heading = route.length > 1 ? headingBetween(route[0], route[1]) : 0;
  for (let leg = 0; leg < lengths.length; leg++) {
    const a = route[leg], b = route[leg + 1];
    if (lengths[leg] > 0) heading = headingBetween(a, b);
    if (remaining >= lengths[leg]) {
      if (leg > 0 || remaining > 0) points.push(b);
      remaining -= lengths[leg];
      continue;
    }
    const t = remaining / lengths[leg];
    if (t > 0) points.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    break;
  }
  const end = points[points.length - 1];
  return { points, pose: { x: end.x, y: end.y, heading } };
}
