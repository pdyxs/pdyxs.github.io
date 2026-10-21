import { FIXED_DT, PLAYER_ACCELERATION, PLAYER_DECELERATION } from '../constants';
import type { Vec } from '../input/steer';

/**
 * Pure: the force on the player for a steer vector (unit or zero), as the
 * original's PlayerControlledParticle does it. Thrust along the current
 * velocity is `acceleration`; across it, `deceleration`; against it, more still
 * (they blend by the cosine). Scaled by the per-type coefficient and the fixed
 * step (Unity adds `value * deltaTime` as a force each frame).
 */
export function playerThrust(steerVec: Vec, velocity: Vec, coefficient: number): Vec {
  if (steerVec.x === 0 && steerVec.y === 0) return { x: 0, y: 0 };
  let force = PLAYER_ACCELERATION;
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed > 0) {
    const dot = (velocity.x * steerVec.x + velocity.y * steerVec.y) / speed;
    force = dot * PLAYER_ACCELERATION + (1 - dot) * PLAYER_DECELERATION;
  }
  const scale = force * FIXED_DT * coefficient;
  return { x: steerVec.x * scale, y: steerVec.y * scale };
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

/** Pure: HOTween's EaseInCubic and EaseOutQuint on 0..1. */
export const easeInCubic = (u: number): number => u * u * u;
export const easeOutQuint = (u: number): number => 1 - (1 - u) ** 5;

/** A value moving from `from` to `to` over `ticks` fixed steps starting at `start`. */
export interface Tween {
  from: number;
  to: number;
  start: number;
  ticks: number;
}

/** Pure: the tween's value after `tick`, eased by `ease` (clamped to its ends). */
export function tweenAt(t: Tween, tick: number, ease: (u: number) => number): number {
  const u = Math.min(1, Math.max(0, (tick - t.start) / t.ticks));
  return t.from + (t.to - t.from) * ease(u);
}

/** Pure: how far from `p` along unit `dir` the box centred on the origin, `width` x `height`, is first left. */
export function distanceToBox(p: Vec, dir: Vec, width: number, height: number): number {
  const reach = (pos: number, d: number, half: number) => (d === 0 ? Infinity : ((d > 0 ? half : -half) - pos) / d);
  return Math.min(reach(p.x, dir.x, width / 2), reach(p.y, dir.y, height / 2));
}

/** Pure: unit `heading` turned toward `target` by at most `maxRadians` the short way round. */
export function rotateToward(heading: Vec, target: Vec, maxRadians: number): Vec {
  const from = Math.atan2(heading.y, heading.x);
  const to = Math.atan2(target.y, target.x);
  let delta = to - from;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  const turned = from + Math.sign(delta) * Math.min(Math.abs(delta), maxRadians);
  return { x: Math.cos(turned), y: Math.sin(turned) };
}

/**
 * Pure: the velocity a particle ends at after absorbing a boson, by momentum
 * (the original uses each type's nominal mass, not the tweening body mass).
 */
export function upgradedVelocity(p: { v: Vec; mass: number }, boson: { v: Vec; mass: number }, newMass: number): Vec {
  return {
    x: (p.v.x * p.mass + boson.v.x * boson.mass) / newMass,
    y: (p.v.y * p.mass + boson.v.y * boson.mass) / newMass,
  };
}
