// Pure decisions for the blob layer: which bodies get a blob, how big, and how
// each blob's outline is pushed about by the forces on it. Ported from the
// Unity original's ParticleBlob.cs (UpdateForces / getRadius) and the force
// events ParticleWorld.cs sends it (onForceAdded). No GL here.
import {
  CHARGE_BY_TYPE,
  COLOUR_STRENGTH,
  EM_STRENGTH,
  FIXED_DT,
  GRAVITY_STRENGTH,
  massOf,
} from '../../../../../lib/particulars/constants';
import type { ForceSwitches, ParticleColour, ParticleKind, Parity } from '../../../../../lib/particulars/scenario/types';
import type { BlackHoleSnapshot, Snapshot } from '../../../../../lib/particulars/sim/snapshot';
import { BLOB_POINTS, FORCE_SPREAD_DEGREES, GROW_SECONDS, MAGNITUDE_FACTOR, MIN_RADIUS } from './constants';

/** One body that wears a blob. `zero` is the undisturbed blob radius (ParticleBlob.zeroPoint). */
export interface BlobBody {
  id: number;
  x: number;
  y: number;
  zero: number;
  parity: Parity;
  type: ParticleKind;
  colour: ParticleColour;
}

/** The id the player's blob is tracked under (particle ids are non-negative). */
export const PLAYER_BLOB_ID = -1;

/**
 * Pure: the bodies that wear a blob this frame — every live particle and the
 * living player (both prefabs carry a ParticleBlob). `bornAt(id)` says when a
 * blob first appeared, so it can grow in from nothing as ParticleBlob.resetAll
 * tweens zeroPoint 0 → size/2 (ease-in cubic). Writes into `out` and returns
 * the count, so the caller can reuse one array.
 */
export function blobBodies(snapshot: Snapshot, time: number, bornAt: (id: number) => number, out: BlobBody[]): number {
  let n = 0;
  const put = (id: number, x: number, y: number, radius: number, parity: Parity, type: ParticleKind, colour: ParticleColour) => {
    const zero = radius * growScale(time - bornAt(id));
    const b = out[n] ?? (out[n] = { id: 0, x: 0, y: 0, zero: 0, parity: 1, type, colour });
    b.id = id; b.x = x; b.y = y; b.zero = zero; b.parity = parity; b.type = type; b.colour = colour;
    n++;
  };
  const pl = snapshot.player;
  if (pl.alive) put(PLAYER_BLOB_ID, pl.x, pl.y, pl.radius, pl.parity, pl.type, pl.colour);
  for (const p of snapshot.particles) {
    if (p.live) put(p.id, p.x, p.y, p.radius, p.parity, p.type, p.colour);
  }
  return n;
}

/** Pure: the grow-in tween's scale at `age` seconds (ease-in cubic over GROW_SECONDS). */
export function growScale(age: number): number {
  if (age >= GROW_SECONDS) return 1;
  if (age <= 0) return 0;
  const u = age / GROW_SECONDS;
  return u * u * u;
}

/**
 * Pure: the signed force between two bodies along the line joining them, as
 * ParticleWorld.addParticleForces computes `forceAmount * fdt` — positive
 * repels. Mirrors sim/forces.ts (the test holds the two together); repeated
 * here only because the sim exposes the net force, and a blob needs each pair.
 */
export function pairForce(a: BlobBody, b: BlobBody, d: number, switches: ForceSwitches): number {
  let amount = 0;
  if (switches.em && d > 0) amount += (EM_STRENGTH * FIXED_DT * chargeOf(a) * chargeOf(b)) / d;
  if (switches.strong && a.colour !== 'white' && b.colour !== 'white') {
    const diffColour = a.colour !== b.colour;
    const attract = a.parity !== b.parity ? !diffColour : diffColour;
    const strength = COLOUR_STRENGTH * FIXED_DT * (diffColour ? 1 : 2);
    amount += attract ? -strength : strength;
  }
  return amount;
}

const chargeOf = (p: { type: ParticleKind; parity: number }) => CHARGE_BY_TYPE[p.type] * p.parity;

const SPREAD_REV = FORCE_SPREAD_DEGREES / 360;
const SPREAD_POINTS = SPREAD_REV * BLOB_POINTS;

/**
 * Pure on its output: add one force to a blob's ring of point forces
 * (`ring[base .. base + BLOB_POINTS)`), as ParticleBlob.UpdateForces does.
 * `angle` (radians) points from the body toward the thing it feels; `value`
 * is positive for a pull toward it, negative for a push away — so the blob
 * bulges toward attractors and dents toward repellers, with a falloff of
 * (1 − |Δθ| / spread)² over ±FORCE_SPREAD_DEGREES.
 */
export function spreadForce(ring: Float32Array, base: number, angle: number, value: number): void {
  let rev = angle / (2 * Math.PI);
  if (rev < 0) rev += 1;
  const lo = Math.ceil(rev * BLOB_POINTS - SPREAD_POINTS);
  const hi = Math.floor(rev * BLOB_POINTS + SPREAD_POINTS);
  for (let i = lo; i <= hi; i++) {
    let w = 1 - Math.abs((i / BLOB_POINTS - rev) / SPREAD_REV);
    w *= w;
    const j = ((i % BLOB_POINTS) + BLOB_POINTS) % BLOB_POINTS;
    ring[base + j] += value * w;
  }
}

/** Pure: a blob point's radius for the force on it (ParticleBlob.getRadius): zero ± up to (zero − min), atan-squashed. */
export function blobRadius(force: number, zero: number, magnitudeFactor = MAGNITUDE_FACTOR): number {
  return zero + (Math.atan(force * magnitudeFactor) * (zero - MIN_RADIUS)) / (Math.PI / 2);
}

/**
 * Pure on its outputs: every blob's outline radii, BLOB_POINTS per body, point
 * k at angle 2πk/BLOB_POINTS in world axes. `ring` is scratch for the summed
 * point forces and `radii` the result; both must hold count × BLOB_POINTS.
 */
export function blobOutlines(
  bodies: readonly BlobBody[],
  count: number,
  blackHoles: readonly BlackHoleSnapshot[],
  switches: ForceSwitches,
  ring: Float32Array,
  radii: Float32Array,
  magnitudeFactor = MAGNITUDE_FACTOR,
): void {
  ring.fill(0, 0, count * BLOB_POINTS);
  for (let i = 0; i < count; i++) {
    const a = bodies[i];
    for (let j = i + 1; j < count; j++) {
      const b = bodies[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d === 0) continue;
      const amount = pairForce(a, b, d, switches);
      if (amount === 0) continue;
      const toB = Math.atan2(dy, dx);
      spreadForce(ring, i * BLOB_POINTS, toB, -amount);
      spreadForce(ring, j * BLOB_POINTS, toB + Math.PI, -amount);
    }
    if (switches.gravity) {
      for (const h of blackHoles) {
        const dx = h.x - a.x;
        const dy = h.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d === 0) continue;
        const pull = (GRAVITY_STRENGTH * FIXED_DT * h.mass * massOf(a.type)) / (d * d);
        spreadForce(ring, i * BLOB_POINTS, Math.atan2(dy, dx), pull);
      }
    }
  }
  for (let i = 0; i < count; i++) {
    const zero = bodies[i].zero;
    for (let k = 0; k < BLOB_POINTS; k++) {
      const idx = i * BLOB_POINTS + k;
      radii[idx] = blobRadius(ring[idx], zero, magnitudeFactor);
    }
  }
}
