// The single spline ribbon (TrailView.cs): control points are saved on a timer,
// on distance, or on a change of direction; a clamped-tangent Catmull-Rom runs
// through them to the live position; each sample is a solid core with clear
// fins either side; alpha falls off with age (1 - age / cutoff).
import { RIBBON_PARTICLE, RIBBON_PLAYER, type RibbonDef, type Rgba } from './constants';
import { maxJump } from './strands';
import { trailColours } from './colour';
import type { Theme } from '../types';
import { Polyline } from './polyline';
import type { StripWriter } from './strip';
import type { TrailSource } from './sources';

export interface RibbonTrail {
  key: number;
  def: RibbonDef;
  isPlayer: boolean;
  parity: number;
  points: Polyline;
  /** Direction of travel at each saved point (unit), parallel to `points`. */
  dirX: number[];
  dirY: number[];
  timer: number;
  x: number;
  y: number;
  diedAt: number | null;
  /** Shrinks to 0 over dieTime once dead (TrailView.Kill tweens CurrTimeCutoff to 0). */
  cutoff: number;
}

/**
 * TrailView.Update's save rule: a new control point when the particle has moved at
 * all and either the timer ran out, it went far enough, or it turned. Pure.
 */
export function shouldSave(
  def: RibbonDef, timer: number, distSq: number, dirDot: number,
): boolean {
  if (distSq <= 0.001) return false;
  return timer >= def.saveTime || distSq > def.saveDist * def.saveDist || dirDot < def.saveDir;
}

/** TrailView.Evaluate: Hermite through p1→p2 with Catmull-Rom tangents clamped to the segment length. */
export function evaluate(
  p0x: number, p0y: number, p1x: number, p1y: number, p2x: number, p2y: number, p3x: number, p3y: number,
  tension: number, t: number, out: { x: number; y: number },
): void {
  const dist = Math.hypot(p1x - p2x, p1y - p2y);
  let m0x = tension * (p2x - p0x);
  let m0y = tension * (p2y - p0y);
  let m1x = tension * (p3x - p1x);
  let m1y = tension * (p3y - p1y);
  const l0 = Math.hypot(m0x, m0y);
  if (l0 > dist && l0 > 0) { m0x *= dist / l0; m0y *= dist / l0; }
  const l1 = Math.hypot(m1x, m1y);
  if (l1 > dist && l1 > 0) { m1x *= dist / l1; m1y *= dist / l1; }
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  out.x = h00 * p1x + h10 * m0x + h01 * p2x + h11 * m1x;
  out.y = h00 * p1y + h10 * m0y + h01 * p2y + h11 * m1y;
}

export class RibbonHistory {
  readonly trails = new Map<number, RibbonTrail>();
  private seen = new Set<number>();
  private lastVel = new Map<number, [number, number]>();

  update(sources: readonly TrailSource[], now: number, dt: number): void {
    this.seen.clear();
    for (const s of sources) {
      this.seen.add(s.key);
      let tr = this.trails.get(s.key);
      if (tr && (tr.diedAt !== null || Math.hypot(s.x - tr.x, s.y - tr.y) > maxJump(s.speed, dt))) {
        this.trails.delete(s.key);
        tr = undefined;
      }
      // Direction of travel from the last frame's position.
      const prev = tr ? [tr.x, tr.y] : [s.x, s.y];
      let dx = s.x - prev[0];
      let dy = s.y - prev[1];
      const l = Math.hypot(dx, dy);
      if (l > 1e-9) { dx /= l; dy /= l; this.lastVel.set(s.key, [dx, dy]); }
      else [dx, dy] = this.lastVel.get(s.key) ?? [1, 0];
      if (!tr) {
        const def = s.isPlayer ? RIBBON_PLAYER : RIBBON_PARTICLE;
        tr = {
          key: s.key, def, isPlayer: s.isPlayer, parity: s.parity, points: new Polyline(32),
          dirX: [], dirY: [], timer: 0, x: s.x, y: s.y, diedAt: null, cutoff: def.cutoff,
        };
        // TrailView.Init: four copies of the start so Catmull-Rom has neighbours.
        for (let i = 0; i < 4; i++) { tr.points.push(s.x, s.y, now); tr.dirX.push(dx); tr.dirY.push(dy); }
        this.trails.set(s.key, tr);
      }
      tr.isPlayer = s.isPlayer;
      tr.parity = s.parity;
      tr.x = s.x;
      tr.y = s.y;
      tr.timer += dt;
      const pts = tr.points;
      const n = pts.length;
      const distSq = (pts.x(n - 1) - s.x) ** 2 + (pts.y(n - 1) - s.y) ** 2;
      const dot = dx * tr.dirX[tr.dirX.length - 2] + dy * tr.dirY[tr.dirY.length - 2];
      if (shouldSave(tr.def, tr.timer, distSq, dot)) {
        pts.push(s.x, s.y, now);
        tr.dirX.push(dx);
        tr.dirY.push(dy);
        tr.timer = 0;
      }
      this.dropOld(tr, now);
    }
    for (const [key, tr] of this.trails) {
      if (this.seen.has(key)) continue;
      if (tr.diedAt === null) tr.diedAt = now;
      tr.cutoff -= (tr.def.cutoff / tr.def.dieTime) * dt;
      if (tr.cutoff <= 0) {
        this.trails.delete(key);
        this.lastVel.delete(key);
      }
    }
  }

  private dropOld(tr: RibbonTrail, now: number): void {
    // Points older than 2 × cutoff go, keeping 4 for the spline.
    while (tr.points.length > 6 && now - tr.points.t(0) > tr.cutoff * 2) {
      tr.points.shift();
      tr.dirX.shift();
      tr.dirY.shift();
    }
  }
}

const tmpA = { x: 0, y: 0 };
const tmpB = { x: 0, y: 0 };
// Scratch sample arrays: x, y, alpha, orthX, orthY.
let samples = new Float64Array(5 * 512);

/** TrailView.EvalVert: a sample's offset (core edge) and fin, for one side. */
function evalVert(
  def: RibbonDef, sx: number, sy: number, ox: number, oy: number, side: 1 | -1, out: number[],
): void {
  const sl = Math.hypot(def.skew[0], def.skew[1]);
  const dx = sl > 0 ? (def.skew[0] / sl) * 0.1 * def.skewWeight * side : 0;
  const dy = sl > 0 ? (def.skew[1] / sl) * 0.1 * def.skewWeight * side : 0;
  const k = (def.orthWeight * def.orthMult) / (def.skewWeight + def.orthWeight);
  const ddx = dx + ox * side * k;
  const ddy = dy + oy * side * k;
  const dl = Math.hypot(ddx, ddy) || 1;
  out[0] = sx + ddx;
  out[1] = sy + ddy;
  out[2] = sx + ddx + (ddx / dl) * def.fadeSize;
  out[3] = sy + ddy + (ddy / dl) * def.fadeSize;
}

const left = [0, 0, 0, 0];
const right = [0, 0, 0, 0];

/** Write a ribbon trail as three strips: left fin, core, right fin. */
export function writeRibbon(out: StripWriter, tr: RibbonTrail, now: number, theme: Theme = 'dark'): void {
  const pts = tr.points;
  const n = pts.length;
  const def = tr.def;
  const clock = tr.diedAt ?? now;
  const cutoff = Math.max(1e-3, tr.cutoff);
  // Control points: saved points then the live position (twice, as the spline's end neighbour).
  const cx = (i: number) => (i < n ? pts.x(i) : tr.x);
  const cy = (i: number) => (i < n ? pts.y(i) : tr.y);
  const ct = (i: number) => (i < n ? pts.t(i) : clock);
  const count = n + 2;
  const segs = count - 3;
  const evals = def.evals;
  const need = (segs * evals + 2) * 5;
  if (samples.length < need) samples = new Float64Array(need * 2);
  let m = 0;
  for (let s = 0; s < segs; s++) {
    const a0 = s, a1 = s + 1, a2 = s + 2, a3 = Math.min(count - 1, s + 3);
    const ta = ct(a1), tb = ct(a2);
    for (let j = 0; j < evals; j++) {
      const t = j / evals;
      evaluate(cx(a0), cy(a0), cx(a1), cy(a1), cx(a2), cy(a2), cx(a3), cy(a3), def.tension, t, tmpA);
      evaluate(cx(a0), cy(a0), cx(a1), cy(a1), cx(a2), cy(a2), cx(a3), cy(a3), def.tension, t + 0.5 / evals, tmpB);
      const ex = tmpB.x - tmpA.x, ey = tmpB.y - tmpA.y;
      const el = Math.hypot(ex, ey);
      const age = clock - (ta + (tb - ta) * t);
      const o = m * 5;
      samples[o] = tmpA.x;
      samples[o + 1] = tmpA.y;
      samples[o + 2] = Math.max(0, 1 - age / cutoff);
      if (el > 1e-9) { samples[o + 3] = -ey / el; samples[o + 4] = ex / el; }
      else if (m > 0) { samples[o + 3] = samples[o - 2]; samples[o + 4] = samples[o - 1]; }
      else { samples[o + 3] = 0; samples[o + 4] = 1; }
      m++;
    }
  }
  if (m < 1) return;
  // Close at the live position.
  {
    const o = m * 5;
    samples[o] = tr.x;
    samples[o + 1] = tr.y;
    samples[o + 2] = 1;
    samples[o + 3] = samples[o - 2];
    samples[o + 4] = samples[o - 1];
    m++;
  }
  const c: Rgba = trailColours(tr.isPlayer, tr.parity, theme).main;
  // Three strips across: [fin L → core L], [core L → core R], [core R → fin R].
  for (let band = 0; band < 3; band++) {
    out.begin();
    for (let i = 0; i < m; i++) {
      const o = i * 5;
      const a = samples[o + 2] * c[3];
      if (a <= 0 && i + 1 < m && samples[o + 7] <= 0) continue;
      evalVert(def, samples[o], samples[o + 1], samples[o + 3], samples[o + 4], 1, left);
      evalVert(def, samples[o], samples[o + 1], samples[o + 3], samples[o + 4], -1, right);
      if (band === 0) {
        out.vertex(left[2], left[3], c[0], c[1], c[2], 0);
        out.vertex(left[0], left[1], c[0], c[1], c[2], a);
      } else if (band === 1) {
        out.vertex(left[0], left[1], c[0], c[1], c[2], a);
        out.vertex(right[0], right[1], c[0], c[1], c[2], a);
      } else {
        out.vertex(right[0], right[1], c[0], c[1], c[2], a);
        out.vertex(right[2], right[3], c[0], c[1], c[2], 0);
      }
    }
  }
}

export function writeAllRibbons(out: StripWriter, history: RibbonHistory, now: number, theme: Theme = 'dark'): void {
  for (const tr of history.trails.values()) writeRibbon(out, tr, now, theme);
}
