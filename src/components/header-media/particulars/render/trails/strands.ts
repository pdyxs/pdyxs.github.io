// The multi-strand trail (TrailView2point0 + TrailViewNudge + Unity TrailRenderer).
// Each particle carries two spinning parents; each parent carries strands at
// small, slowly wandering offsets. Every strand is a TrailRenderer: a point is
// recorded whenever the strand's tip has moved MIN_VERTEX_DISTANCE, points
// expire after `time` seconds, and width / alpha run head → tail by age.
//
// `TrailHistory.update` is deterministic given its random source, and the
// geometry is written into a StripWriter: both testable without a canvas.
import {
  MIN_VERTEX_DISTANCE, NUDGE_ACCEL, NUDGE_MAX_VEL, SPIN_PARENTS, SPIN_SPEED_FACTOR, STRANDS,
  STRAND_DIE_SECONDS, TELEPORT_DISTANCE, type Rgba, type StrandDef,
} from './constants';
import { trailColours } from './colour';
import type { Theme } from '../types';
import { Polyline } from './polyline';
import type { StripWriter } from './strip';
import type { TrailSource } from './sources';

/** How far a source may move in one frame before it counts as a teleport: fast particles (neutrinos) cover ground. */
export function maxJump(speed: number, dt: number): number {
  return TELEPORT_DISTANCE + speed * dt * 2;
}

/** Unity's Mathf.Clamp, verbatim: with min > max it flips between the two (TrailViewNudge relies on it). */
export function unityClamp(v: number, min: number, max: number): number {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

/** degrees/second a parent spins at for a particle moving at `speed`. */
export function spinRate(speed: number, base: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, base * speed * SPIN_SPEED_FACTOR));
}

/** Piecewise-linear lookup of evenly spaced keys at f ∈ [0, 1]. */
export function sampleKeys(keys: readonly number[], f: number): number {
  const n = keys.length - 1;
  const p = Math.min(n, Math.max(0, f * n));
  const i = Math.min(n - 1, Math.floor(p));
  return keys[i] + (keys[i + 1] - keys[i]) * (p - i);
}

export interface Strand {
  def: StrandDef;
  /** The nudged coordinate and its random-walk velocity. */
  nudge: number;
  nudgeVel: number;
  points: Polyline;
  /** Where the tip is now (the trail's live head). */
  headX: number;
  headY: number;
}

export interface Rig {
  key: number;
  isPlayer: boolean;
  parity: number;
  /** Parent rotations, degrees. */
  angles: number[];
  strands: Strand[];
  x: number;
  y: number;
  /** null while the particle lives; otherwise when it went (trail clock freezes there). */
  diedAt: number | null;
  /** Seconds since death, for the width fade. */
  dying: number;
}

export type Random = () => number;

export class TrailHistory {
  readonly rigs = new Map<number, Rig>();
  private seen = new Set<number>();

  constructor(
    private readonly strands: readonly StrandDef[] = STRANDS,
    private readonly random: Random = Math.random,
  ) {}

  /** Advance every rig to `now` with this frame's sources. */
  update(sources: readonly TrailSource[], now: number, dt: number): void {
    this.seen.clear();
    for (const s of sources) {
      this.seen.add(s.key);
      let rig = this.rigs.get(s.key);
      if (rig && (rig.diedAt !== null || Math.hypot(s.x - rig.x, s.y - rig.y) > maxJump(s.speed, dt))) {
        // Came back (respawn, re-used id) or jumped: start a fresh trail.
        this.rigs.delete(s.key);
        rig = undefined;
      }
      if (!rig) {
        rig = this.create(s);
        this.rigs.set(s.key, rig);
      }
      rig.isPlayer = s.isPlayer;
      rig.parity = s.parity;
      rig.x = s.x;
      rig.y = s.y;
      for (let i = 0; i < SPIN_PARENTS.length; i++) {
        const p = SPIN_PARENTS[i];
        rig.angles[i] = (rig.angles[i] + dt * spinRate(s.speed, p.base, p.min, p.max)) % 360;
      }
      for (const st of rig.strands) this.stepStrand(rig, st, now, dt);
    }
    for (const [key, rig] of this.rigs) {
      if (this.seen.has(key)) continue;
      if (rig.diedAt === null) rig.diedAt = now;
      rig.dying += dt;
      if (rig.dying >= STRAND_DIE_SECONDS) this.rigs.delete(key);
    }
  }

  private create(s: TrailSource): Rig {
    const rig: Rig = {
      key: s.key,
      isPlayer: s.isPlayer,
      parity: s.parity,
      angles: SPIN_PARENTS.map(() => this.random() * 360),
      strands: this.strands.map((def) => ({
        def,
        nudge: def.nudgeX ? def.x : def.y,
        nudgeVel: 0,
        points: new Polyline(64),
        headX: s.x,
        headY: s.y,
      })),
      x: s.x,
      y: s.y,
      diedAt: null,
      dying: 0,
    };
    return rig;
  }

  private stepStrand(rig: Rig, st: Strand, now: number, dt: number): void {
    const d = st.def;
    // TrailViewNudge.Update
    st.nudgeVel = Math.max(-NUDGE_MAX_VEL, Math.min(NUDGE_MAX_VEL, st.nudgeVel + (this.random() * 2 - 1) * NUDGE_ACCEL * dt));
    st.nudge = unityClamp(st.nudge + st.nudgeVel * dt, d.min, d.max);
    const lx = d.nudgeX ? st.nudge : d.x;
    const ly = d.nudgeX ? d.y : st.nudge;
    const a = (rig.angles[d.parent] * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    st.headX = rig.x + lx * c - ly * s;
    st.headY = rig.y + lx * s + ly * c;
    // TrailRenderer: lay a point once the tip has moved far enough from the last one.
    const pts = st.points;
    const n = pts.length;
    if (n === 0 || Math.hypot(st.headX - pts.x(n - 1), st.headY - pts.y(n - 1)) > MIN_VERTEX_DISTANCE) {
      pts.push(st.headX, st.headY, now);
    }
    pts.expire(now, d.time);
  }
}

/** Width scale while dying: TrailView2point0.Kill tweens startWidth to 0 over dieTime. */
export function dyingScale(dying: number): number {
  return Math.max(0, 1 - dying / STRAND_DIE_SECONDS);
}

/**
 * Write one strand as a ribbon: oldest point first, the live tip last. Age sets
 * width and alpha; the tail is clipped exactly where age reaches the strand's time.
 * A dead rig's clock is frozen at its death, so it stays put while it thins.
 */
export function writeStrand(out: StripWriter, st: Strand, rig: Rig, now: number, theme: Theme = 'dark'): void {
  const d = st.def;
  const pts = st.points;
  const n = pts.length;
  const clock = rig.diedAt ?? now;
  const colours = trailColours(rig.isPlayer, rig.parity, theme);
  const colour: Rgba = d.inverse ? colours.inverse : colours.main;
  const scale = rig.diedAt === null ? 1 : dyingScale(rig.dying);
  if (n === 0 || scale <= 0) return;

  // The vertex list is points[0..n) then the head, unless the head sits on the last point.
  const headDup = Math.hypot(st.headX - pts.x(n - 1), st.headY - pts.y(n - 1)) < 1e-6;
  const total = headDup ? n : n + 1;
  if (total < 2) return;
  const X = (i: number) => (i < n ? pts.x(i) : st.headX);
  const Y = (i: number) => (i < n ? pts.y(i) : st.headY);
  const T = (i: number) => (i < n ? pts.t(i) : clock);

  out.begin();
  for (let i = 0; i < total; i++) {
    let x = X(i);
    let y = Y(i);
    let age = clock - T(i);
    if (age > d.time) {
      // Only the oldest point can be past due (Polyline.expire keeps one): clip toward the next.
      const ageNext = clock - T(i + 1);
      const f = (age - d.time) / Math.max(1e-6, age - ageNext);
      x += (X(i + 1) - x) * f;
      y += (Y(i + 1) - y) * f;
      age = d.time;
    }
    const f = Math.min(1, Math.max(0, age / d.time));
    const half = ((d.startWidth + (d.endWidth - d.startWidth) * f) * scale) / 2;
    const alpha = sampleKeys(d.alphas, f) * colour[3];
    // Direction from the neighbours.
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(total - 1, i + 1);
    let tx = X(i1) - X(i0);
    let ty = Y(i1) - Y(i0);
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    out.vertex(x - ty * half, y + tx * half, colour[0], colour[1], colour[2], alpha);
    out.vertex(x + ty * half, y - tx * half, colour[0], colour[1], colour[2], alpha);
  }
}

/** Every strand of every rig. Broad, faint strands first so the thin ones sit on top. */
export function writeAllStrands(out: StripWriter, history: TrailHistory, now: number, theme: Theme = 'dark'): void {
  for (const rig of history.rigs.values()) {
    for (const st of rig.strands) writeStrand(out, st, rig, now, theme);
  }
}
