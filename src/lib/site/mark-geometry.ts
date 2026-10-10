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
