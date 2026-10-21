import type { Point, Pose } from '../types';
import type { Tuning } from './tuning';

export type Side = 'left' | 'right';

/** One steering plan: turn towards `side` by `turnAmount` degrees, then straight. */
export type Steering = { side: Side; turnAmount: number; length: number };

const RAD = Math.PI / 180;
// Degrees between sampled points along an arc.
const ARC_STEP = 2;
// Longer than the viewBox diagonal, so a reach shape always runs off the edge.
const REACH_LENGTH = 20;

const sign = (side: Side) => (side === 'right' ? 1 : -1);

/**
 * Points along a steering plan, `length` of path in total: from the pose,
 * turn towards `side` for `turnAmount` degrees on a circle of radius
 * `turnRadius`, then straight on. Heading is degrees clockwise from up, so
 * the direction at heading h is (sin h, -cos h) and a right turn raises it.
 */
export function steerPath(
  pose: Pose,
  side: Side,
  turnAmount: number,
  tuning: Tuning,
  length: number,
): Point[] {
  const s = sign(side);
  const R = tuning.turnRadius;
  const h0 = pose.heading * RAD;
  // centre of the turning circle: R along the side's normal
  const cx = pose.x + s * R * Math.cos(h0);
  const cy = pose.y + s * R * Math.sin(h0);
  const at = (phi: number): Point => {
    const h = h0 + s * phi;
    return { x: cx - s * R * Math.cos(h), y: cy - s * R * Math.sin(h) };
  };

  const points: Point[] = [{ x: pose.x, y: pose.y }];
  const arcLength = R * turnAmount * RAD;
  const arcUsed = Math.min(arcLength, length);
  const phiUsed = arcUsed / R;
  const steps = Math.ceil((phiUsed / RAD) / ARC_STEP);
  for (let i = 1; i <= steps; i++) points.push(at((phiUsed * i) / steps));

  const straight = length - arcUsed;
  if (straight > 0) {
    const end = at(phiUsed);
    const h = h0 + s * phiUsed;
    points.push({ x: end.x + straight * Math.sin(h), y: end.y - straight * Math.cos(h) });
  }
  return points;
}

/**
 * The region the ship can reach: between the full-left and full-right
 * steering plans, each extended far. A polygon — the left edge out, then the
 * right edge back.
 */
export function reachShape(pose: Pose, tuning: Tuning): Point[] {
  const left = steerPath(pose, 'left', tuning.turnCap, tuning, REACH_LENGTH);
  const right = steerPath(pose, 'right', tuning.turnCap, tuning, REACH_LENGTH);
  // right reversed ends back at the pose, which `left` already starts at
  return [...left, ...right.reverse().slice(0, -1)];
}

/**
 * The steering plan that ends exactly at `target`, or null when none does
 * (behind the ship, past the turn cap, or inside a turning circle).
 *
 * Per side, in a frame where the ship is at the origin facing +b and the turn
 * is towards +a: the circle's centre is (R, 0); the straight leg leaves the
 * circle tangentially and reaches the target, which fixes the turn angle.
 */
export function steeringTo(pose: Pose, target: Point, tuning: Tuning): Steering | null {
  const R = tuning.turnRadius;
  const h = pose.heading * RAD;
  const dx = target.x - pose.x;
  const dy = target.y - pose.y;
  const forward = dx * Math.sin(h) - dy * Math.cos(h);
  const right = dx * Math.cos(h) + dy * Math.sin(h);

  let best: Steering | null = null;
  for (const side of ['right', 'left'] as const) {
    const a = sign(side) * right - R; // relative to the centre
    const b = forward;
    const d = Math.hypot(a, b);
    if (d < R) continue;
    const alpha = Math.atan2(b, a);
    let phi = Math.PI - alpha - Math.acos(R / d);
    phi -= 2 * Math.PI * Math.round(phi / (2 * Math.PI));
    const eps = 1e-9;
    if (phi < -eps || phi > tuning.turnCap * RAD + eps) continue;
    phi = Math.max(0, phi);
    const length = R * phi + Math.sqrt(d * d - R * R);
    if (best === null || length < best.length) best = { side, turnAmount: phi / RAD, length };
  }
  return best;
}
