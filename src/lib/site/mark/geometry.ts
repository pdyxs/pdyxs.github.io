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
}

/** Falling out: fast, and the string overshoots a little as it catches. */
export const DROP: StringSpring = { stiffness: 900, damping: 32 };
/** Reeled up: slower, and critically damped so it never runs past nothing. */
export const REEL: StringSpring = { stiffness: 130, damping: 2 * Math.sqrt(130) };

/** One step toward `len` px of string; pure, so a caller can sub-step it. */
export function stepBauble(b: Bauble, len: number, dt: number, spring: StringSpring = DROP): Bauble {
  const reach = Math.max(len, b.r, 1);
  const rv = b.rv + (spring.stiffness * (len - b.r) - spring.damping * b.rv) * dt;
  const omega = b.omega + (-(GRAVITY / reach) * Math.sin(b.theta) - SWING_DAMPING * b.omega) * dt;
  return { r: b.r + rv * dt, rv, theta: b.theta + omega * dt, omega };
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
