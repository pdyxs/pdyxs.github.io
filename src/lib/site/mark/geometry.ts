// Posing the suspended-dot mark's authored threads (src/data/mark-rig.ts).
// Pure: positions in, curve points out. Shared by the mark experiment and its
// strand editor so both draw exactly the same threads.

import type { ChordPoint, MarkRig } from '@data/mark-rig';

export interface V {
  x: number;
  y: number;
}

export interface ThreadGeometry {
  A: V; // anchor, on the letters
  B: V; // attach, on the dot
  c1: V; // control point nearer the anchor
  c2: V; // control point nearer the dot
}

const lerp = (a: V, b: V, p: number): V => ({ x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p });

/** A point in the A→B chord frame: t along the chord, u across it (× length). */
export function chordPoint(A: V, B: V, c: ChordPoint): V {
  const d = { x: B.x - A.x, y: B.y - A.y };
  return { x: A.x + d.x * c.t - d.y * c.u, y: A.y + d.y * c.t + d.x * c.u };
}

/** The inverse of chordPoint: where P sits in the A→B chord frame. */
export function toChord(A: V, B: V, P: V): ChordPoint {
  const d = { x: B.x - A.x, y: B.y - A.y };
  const d2 = d.x * d.x + d.y * d.y || 1;
  const v = { x: P.x - A.x, y: P.y - A.y };
  return { t: (v.x * d.x + v.y * d.y) / d2, u: (v.x * -d.y + v.y * d.x) / d2 };
}

export interface Pose {
  /** Centre of the dot's place in the title. */
  slot: V;
  /** Top-left of the dot as drawn, and its size. */
  dot: V;
  size: number;
  /** Pixels per title em, at the title's current scale. */
  em: number;
  /** 0 = title pose, 1 = hanging pose. */
  p: number;
}

/** Every thread's curve for a given pose of the title and dot. */
export function poseThreads(rig: MarkRig, pose: Pose): ThreadGeometry[] {
  const { slot, dot, size, em, p } = pose;
  return rig.threads.map((t) => {
    const A = { x: slot.x + t.anchor.x * em, y: slot.y + t.anchor.y * em };
    const B = { x: dot.x + t.attach.x * size, y: dot.y + t.attach.y * size };
    const hang = (h: V) => ({ x: B.x + h.x * em, y: B.y + h.y * em });
    return {
      A,
      B,
      c1: lerp(chordPoint(A, B, t.rest[0]), hang(t.hang[0]), p),
      c2: lerp(chordPoint(A, B, t.rest[1]), hang(t.hang[1]), p),
    };
  });
}

/** Threads are never drawn thinner than this, px. */
export const MIN_STROKE = 1.2;

/** A thread's stroke width, px, at `em` px per em. */
export function threadStroke(rig: MarkRig, em: number): number {
  return Math.max(MIN_STROKE, rig.width * em);
}

/** SVG path data for one thread. */
export function threadPathData(g: ThreadGeometry): string {
  const f = (v: V) => `${v.x.toFixed(1)} ${v.y.toFixed(1)}`;
  return `M${f(g.A)} C${f(g.c1)} ${f(g.c2)} ${f(g.B)}`;
}

/** Browser-storage key for in-progress rig edits, shared by both pages. */
export const RIG_STORAGE_KEY = 'mark-rig-experiment';

// ── Tools: baubles hung from the threads' far ends ───────────────────

/** Pull a thread straight: k = 0 leaves its slack, k = 1 puts both control points on the chord. */
export function tauten(g: ThreadGeometry, k: number): ThreadGeometry {
  return {
    ...g,
    c1: lerp(g.c1, lerp(g.A, g.B, 1 / 3), k),
    c2: lerp(g.c2, lerp(g.A, g.B, 2 / 3), k),
  };
}

/**
 * Where a tool hangs from. In the title that is the thread's anchor, on the
 * letters. Once the title has left the screen the anchor is off it, so the tool
 * hangs from where the taut thread crosses the top edge (`topY`) instead.
 */
export function toolPivot(g: ThreadGeometry, hanging: boolean, topY: number): V {
  if (!hanging || g.A.y >= topY || g.B.y === g.A.y) return g.A;
  const t = Math.min(1, Math.max(0, (topY - g.A.y) / (g.B.y - g.A.y)));
  return { x: g.A.x + (g.B.x - g.A.x) * t, y: topY };
}

/**
 * A bauble on a string, in polar coordinates about its pivot: `r` is the string
 * paid out, `theta` its angle from straight down. The string extends and
 * retracts as a spring on `r`; the swing is a damped pendulum.
 */
export interface Bauble {
  r: number;
  rv: number;
  theta: number;
  omega: number;
}

const GRAVITY = 2200; // px/s²
const SWING_DAMPING = 1.1; // 1/s

/** How the string pays out or draws in: a spring on its length. */
export interface StringSpring {
  stiffness: number; // 1/s²
  damping: number; // 1/s
  /**
   * The swing's damping ratio, if this spring sets one: scaled to the
   * pendulum's own frequency, √(g/r), so a short string settles as surely as a
   * long one. Without it the swing is lightly damped (SWING_DAMPING).
   */
  swingZeta?: number;
}

/** Falling out: fast, and the string overshoots a little as it catches. */
export const DROP: StringSpring = { stiffness: 900, damping: 32 };
/** Reeled up: slower, and critically damped so it never runs past nothing. */
export const REEL: StringSpring = { stiffness: 130, damping: 2 * Math.sqrt(130) };
/**
 * Let go of a drag: back to hanging, barely overshooting, so the bauble is
 * where it was and easy to find again. Its string and its swing are both
 * near-critically damped.
 */
export const RETURN: StringSpring = { stiffness: 260, damping: 2 * 0.9 * Math.sqrt(260), swingZeta: 0.85 };

const STILL: V = { x: 0, y: 0 };

/**
 * One step toward `len` px of string; pure, so a caller can sub-step it.
 * `pivotAccel` (px/s², y down) is how the pivot is accelerating: in the
 * pivot's frame that is a pseudo-force, so a bauble whose pivot is carried
 * (a child under a dragged parent) lags and swings rather than riding rigid.
 * It turns the swing only; the string's length is the spring's alone.
 */
export function stepBauble(b: Bauble, len: number, dt: number, spring: StringSpring = DROP, pivotAccel: V = STILL): Bauble {
  const reach = Math.max(len, b.r, 1);
  const rv = b.rv + (spring.stiffness * (len - b.r) - spring.damping * b.rv) * dt;
  const sin = Math.sin(b.theta);
  const cos = Math.cos(b.theta);
  // Tangential component of gravity less the pivot's acceleration, over the arm.
  const swing = (-GRAVITY * sin - pivotAccel.x * cos + pivotAccel.y * sin) / reach;
  const damping = spring.swingZeta === undefined ? SWING_DAMPING : 2 * spring.swingZeta * Math.sqrt(GRAVITY / reach);
  const omega = b.omega + (swing - damping * b.omega) * dt;
  return { r: b.r + rv * dt, rv, theta: b.theta + omega * dt, omega };
}

/** A pivot's motion, tracked frame to frame: where it is, its (smoothed) velocity, and its acceleration. */
export interface PivotTrack {
  p: V;
  v: V;
  a: V;
}

/** How long the pivot's velocity is smoothed over, s: pointer moves land unevenly between frames. */
export const PIVOT_SMOOTHING = 0.06;
/**
 * The most acceleration a pivot passes on, px/s². Under gravity, so a
 * carried bauble trails (at most atan(¾) ≈ 37° held, about twice that at the
 * swing's peak) and never goes over the top; and a jump (a resize, a
 * re-anchor) is a nudge, not a fling.
 */
export const PIVOT_ACCEL_MAX = GRAVITY * 0.75;

/**
 * The pivot's track after it moved to `p` over `dt`. With no track yet it
 * starts still. The velocity is low-passed (PIVOT_SMOOTHING) before it is
 * differentiated, and the acceleration is clamped (PIVOT_ACCEL_MAX).
 */
export function trackPivot(prev: PivotTrack | null, p: V, dt: number): PivotTrack {
  if (!prev || !(dt > 0)) return { p, v: STILL, a: STILL };
  const k = Math.min(1, dt / PIVOT_SMOOTHING);
  const v = {
    x: prev.v.x + ((p.x - prev.p.x) / dt - prev.v.x) * k,
    y: prev.v.y + ((p.y - prev.p.y) / dt - prev.v.y) * k,
  };
  let a = { x: (v.x - prev.v.x) / dt, y: (v.y - prev.v.y) / dt };
  const m = Math.hypot(a.x, a.y);
  if (m > PIVOT_ACCEL_MAX) a = { x: (a.x / m) * PIVOT_ACCEL_MAX, y: (a.y / m) * PIVOT_ACCEL_MAX };
  return { p, v, a };
}

export function baublePos(pivot: V, b: Bauble): V {
  return { x: pivot.x + b.r * Math.sin(b.theta), y: pivot.y + b.r * Math.cos(b.theta) };
}

/** The bauble state that puts it at `p` with no motion (a drag holds it there). */
export function baubleAt(pivot: V, p: V): Bauble {
  return { r: Math.hypot(p.x - pivot.x, p.y - pivot.y), rv: 0, theta: Math.atan2(p.x - pivot.x, p.y - pivot.y), omega: 0 };
}

/** True while a bauble still has motion worth animating. */
export function baubleMoving(b: Bauble, len: number): boolean {
  return Math.abs(b.omega) > 0.02 || Math.abs(b.theta) > 0.002 || Math.abs(b.rv) > 0.5 || Math.abs(b.r - len) > 0.2;
}
