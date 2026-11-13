// Per-particle view state the snapshot doesn't carry: the eyes' smoothed offsets, decay timers,
// a change's crossfade, a W's facing, telegraph age, the player's explosion cooldown. Updated once
// per frame from the snapshot; the decisions are the pure helpers in motion.ts.
import type { Snapshot } from '../../../../../lib/particulars/sim/snapshot';
import type { ParticleKind, Parity } from '../../../../../lib/particulars/scenario/types';
import {
  CHANGE_TWEEN_SECONDS,
  CHARGE_BY_TYPE,
  DECAY_TIME_BY_TYPE,
  FIXED_DT,
  PLAYER_EXPLOSION_COOLDOWN_SECONDS,
  W_TURN_DEGREES_PER_SECOND,
} from '../../../../../lib/particulars/constants';
import { approach, particleEyeGoal, playerEyeGoal, turnToward, type Vec } from './motion';
import { EYE_MOVE_SPEED, PARTICLE_EYE_MAX_MOVE, PLAYER_EYE_MAX_MOVE } from './palette';
import { recipeKey, type BodySpec } from './recipe';

export const PLAYER_KEY = -1;

export interface BodyState {
  /** Layer offsets, world units: x0, y0, x1, y1, ... for layers 0..5. */
  eyes: Float32Array;
  /** Seconds since first seen (telegraph progress). */
  age: number;
  /** Sim steps the decay timer has run (mirrors world.ts `decayTicks`). */
  decayTicks: number;
  key: string;
  /** The spec before the last change, while it fades out. */
  prev: BodySpec | null;
  /** Seconds since the last change. */
  changeAge: number;
  /** A W's facing (unit vector). */
  heading: Vec;
  seen: boolean;
}

const decays = (t: ParticleKind): t is keyof typeof DECAY_TIME_BY_TYPE => t in DECAY_TIME_BY_TYPE;

export class Tracker {
  readonly bodies = new Map<number, BodyState>();
  /** Seconds of explosion cooldown the player has left. */
  cooldownLeft = 0;
  private lastTick = -1;
  private seenExplosions = new Set<number>();

  constructor(private lean: number) {}

  get(id: number): BodyState | undefined {
    return this.bodies.get(id);
  }

  update(snap: Snapshot, dt: number): void {
    if (snap.tick < this.lastTick) this.reset();
    const steps = this.lastTick < 0 ? 0 : snap.tick - this.lastTick;
    this.lastTick = snap.tick;
    for (const b of this.bodies.values()) b.seen = false;

    const p = snap.player;
    const strong = snap.forces.strong;
    if (p.alive) {
      const spec: BodySpec = { type: p.type, parity: p.parity, colour: p.colour, isPlayer: true, strong };
      const b = this.touch(PLAYER_KEY, spec, p, dt, steps, true);
      const table = PLAYER_EYE_MAX_MOVE[p.type];
      for (let l = 1; l < 6; l++) this.ease(b, l, playerEyeGoal(p.steer, table[l], this.lean), dt);
    }
    for (const q of snap.particles) {
      const spec: BodySpec = { type: q.type, parity: q.parity, colour: q.colour, isPlayer: false, strong };
      const b = this.touch(q.id, spec, q, dt, steps, q.live);
      const table = PARTICLE_EYE_MAX_MOVE[q.type];
      for (let l = 1; l < 6; l++) this.ease(b, l, particleEyeGoal(q, p, table[l], this.lean), dt);
      if (q.type === 'W' && q.live) b.heading = turnToward(b.heading, this.wTarget(snap, q) ?? b.heading, (W_TURN_DEGREES_PER_SECOND * Math.PI / 180) * dt);
    }
    for (const [id, b] of this.bodies) if (!b.seen) this.bodies.delete(id);

    // A new explosion centred on the player is the player's own: its cooldown starts.
    this.cooldownLeft = Math.max(0, this.cooldownLeft - dt);
    const live = new Set<number>();
    for (const x of snap.explosions) {
      live.add(x.id);
      if (this.seenExplosions.has(x.id)) continue;
      this.seenExplosions.add(x.id);
      if (Math.hypot(x.x - p.x, x.y - p.y) <= p.radius) this.cooldownLeft = PLAYER_EXPLOSION_COOLDOWN_SECONDS;
    }
    for (const id of this.seenExplosions) if (!live.has(id)) this.seenExplosions.delete(id);
  }

  private reset(): void {
    this.bodies.clear();
    this.seenExplosions.clear();
    this.cooldownLeft = 0;
    this.lastTick = -1;
  }

  private touch(id: number, spec: BodySpec, at: { vx: number; vy: number; type: ParticleKind }, dt: number, steps: number, live: boolean): BodyState {
    let b = this.bodies.get(id);
    const key = recipeKey(spec);
    if (!b) {
      const v = Math.hypot(at.vx, at.vy);
      b = {
        eyes: new Float32Array(12),
        age: 0,
        decayTicks: 0,
        key,
        prev: null,
        changeAge: CHANGE_TWEEN_SECONDS,
        heading: v > 1e-6 ? { x: -at.vx / v, y: -at.vy / v } : { x: -1, y: 0 },
        seen: true,
      };
      this.bodies.set(id, b);
    } else {
      b.age += dt;
      b.changeAge += dt;
      if (b.key !== key) {
        b.prev = specFromKey(b.key, spec.isPlayer);
        b.key = key;
        b.changeAge = 0;
      }
    }
    if (b.changeAge >= CHANGE_TWEEN_SECONDS) b.prev = null;
    if (live && decays(spec.type)) b.decayTicks += steps;
    b.seen = true;
    return b;
  }

  private ease(b: BodyState, layer: number, goal: Vec, dt: number): void {
    const i = layer * 2;
    const next = approach({ x: b.eyes[i], y: b.eyes[i + 1] }, goal, dt, EYE_MOVE_SPEED[layer]);
    b.eyes[i] = next.x;
    b.eyes[i + 1] = next.y;
  }

  /** The direction to the nearest live particle a W could be absorbed by (world.ts turnBoson). */
  private wTarget(snap: Snapshot, w: Snapshot['particles'][number]): Vec | null {
    const charge = CHARGE_BY_TYPE.W * w.parity;
    let best: Vec | null = null;
    let bestD = Infinity;
    const consider = (x: number, y: number, type: ParticleKind, parity: Parity) => {
      if (type === 'W' || CHARGE_BY_TYPE[type] * parity * charge >= 0) return;
      const d = (x - w.x) ** 2 + (y - w.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { x: x - w.x, y: y - w.y };
      }
    };
    if (snap.player.alive) consider(snap.player.x, snap.player.y, snap.player.type, snap.player.parity);
    for (const q of snap.particles) if (q.live && q !== w) consider(q.x, q.y, q.type, q.parity);
    return best;
  }
}

function specFromKey(key: string, isPlayer: boolean): BodySpec {
  const [type, parity, colour, strong] = key.split('|');
  return { type: type as ParticleKind, parity: Number(parity) as Parity, colour: colour as BodySpec['colour'], isPlayer, strong: strong === '1' };
}

/** Seconds the decay timer has run. */
export const decayElapsed = (b: BodyState): number => b.decayTicks * FIXED_DT;
