// Pure handle maths for the level view: where a formation's or wall's handles
// sit, and what a drag does to it. Nothing here reads or writes the store or the
// DOM; the editor turns the result into an Edit.
//
// A drag is always computed from the state at drag start plus the total pointer
// delta, so it never accumulates error and never depends on a previous move.

import type { Formation, WallDef } from '../scenario/types.ts';

export interface Vec {
  x: number;
  y: number;
}
/** Where a formation's centre is in the world, and the angle of every enclosing formation (degrees). */
export interface Frame extends Vec {
  angle: number;
}
export interface Handle extends Vec {
  id: string;
}
export type FormationHandleId = 'spacing' | 'radius' | 'rotation';

const round = (n: number) => Math.round(n * 100) / 100 + 0; // + 0 folds -0 into 0
const rad = (deg: number) => (deg * Math.PI) / 180;
const rotate = (v: Vec, deg: number): Vec => ({
  x: v.x * Math.cos(rad(deg)) - v.y * Math.sin(rad(deg)),
  y: v.x * Math.sin(rad(deg)) + v.y * Math.cos(rad(deg)),
});
const toWorld = (local: Vec, frame: Frame, angle: number): Vec => {
  const r = rotate(local, angle);
  return { x: frame.x + r.x, y: frame.y + r.y };
};

/** Distance of the rotation handle beyond the formation's own extent, world units. */
export const ROTATION_ARM = 1;

const normalise = (deg: number) => {
  const d = ((((deg + 180) % 360) + 360) % 360) - 180;
  return d === -180 ? 180 : d;
};

/** The handle's angle in the world when a formation of total angle `angle` is turned; its arm points at -y locally. */
const armAngle = (angle: number) => angle - 90;

export function formationHandles(f: Formation, frame: Frame): Handle[] {
  const angle = frame.angle + (f.angle ?? 0);
  const out: Handle[] = [];
  if (f.kind === 'line') {
    out.push({ id: 'spacing', ...toWorld({ x: ((f.count - 1) / 2) * f.distance, y: 0 }, frame, angle) });
  }
  if (f.kind === 'circle') out.push({ id: 'radius', ...toWorld({ x: f.radius, y: 0 }, frame, angle) });
  const extent = f.kind === 'circle' ? f.radius : 0;
  if (f.kind !== 'single') out.push({ id: 'rotation', ...toWorld({ x: 0, y: -(extent + ROTATION_ARM) }, frame, angle) });
  return out;
}

export function dragFormation(f: Formation, handle: FormationHandleId, delta: Vec, frame: Frame): Formation {
  const start = formationHandles(f, frame).find((h) => h.id === handle);
  if (!start) return f;
  const p = { x: start.x + delta.x - frame.x, y: start.y + delta.y - frame.y };
  if (handle === 'rotation') {
    const total = (Math.atan2(p.y, p.x) * 180) / Math.PI - armAngle(0);
    return { ...f, angle: round(normalise(total - frame.angle)) };
  }
  if (f.kind === 'circle') return { ...f, radius: round(Math.max(0, Math.hypot(p.x, p.y))) };
  if (f.kind !== 'line') return f;
  const angle = frame.angle + (f.angle ?? 0);
  const along = rotate(p, -angle).x;
  return { ...f, distance: round(Math.max(0, along / ((f.count - 1) / 2))) };
}

export type WallHandleId = 'centre' | 'size' | 'rotation' | 'radius' | 'thickness' | 'start' | 'sweep';

const degrees = (v: Vec) => (Math.atan2(v.y, v.x) * 180) / Math.PI;

export function wallHandles(w: WallDef): Handle[] {
  const centre: Handle = { id: 'centre', x: w.x, y: w.y };
  if (w.shape === 'rect') {
    const frame = { x: w.x, y: w.y, angle: 0 };
    const a = w.angle ?? 0;
    return [
      centre,
      { id: 'size', ...toWorld({ x: w.width / 2, y: w.height / 2 }, frame, a) },
      { id: 'rotation', ...toWorld({ x: 0, y: -(w.height / 2 + ROTATION_ARM) }, frame, a) },
    ];
  }
  const start = w.start ?? 0;
  const sweep = w.sweep ?? 360;
  const inner = w.radius - w.thickness;
  const polar = (r: number, deg: number): Vec => ({ x: w.x + r * Math.cos(rad(deg)), y: w.y + r * Math.sin(rad(deg)) });
  return [
    centre,
    { id: 'radius', ...polar(w.radius, start + sweep / 2) },
    { id: 'thickness', ...polar(inner, start + sweep / 2) },
    { id: 'start', ...polar(w.radius, start) },
    { id: 'sweep', ...polar((w.radius + inner) / 2, start + sweep) },
  ];
}

export function dragWall(w: WallDef, handle: WallHandleId, delta: Vec): WallDef {
  if (handle === 'centre') return { ...w, x: round(w.x + delta.x), y: round(w.y + delta.y) };
  const start = wallHandles(w).find((h) => h.id === handle);
  if (!start) return w;
  const p = { x: start.x + delta.x - w.x, y: start.y + delta.y - w.y };
  if (w.shape === 'rect') {
    if (handle === 'size') {
      const local = rotate(p, -(w.angle ?? 0));
      return { ...w, width: round(Math.max(0, 2 * Math.abs(local.x))), height: round(Math.max(0, 2 * Math.abs(local.y))) };
    }
    if (handle === 'rotation') return { ...w, angle: round(normalise(degrees(p) - armAngle(0))) };
  }
  if (w.shape === 'arc') {
    const dist = Math.hypot(p.x, p.y);
    if (handle === 'radius') return { ...w, radius: round(dist) };
    if (handle === 'thickness') return { ...w, thickness: round(Math.min(w.radius, Math.max(0, w.radius - dist))) };
    if (handle === 'start') return { ...w, start: round(normalise(degrees(p))) };
    if (handle === 'sweep') {
      const swept = ((((degrees(p) - (w.start ?? 0)) % 360) + 360) % 360) || 360;
      return { ...w, sweep: round(Math.max(1, swept)) };
    }
  }
  return w;
}
