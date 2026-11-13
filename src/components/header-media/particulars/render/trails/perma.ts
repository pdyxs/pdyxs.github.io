// Permanent marks (PermaTrailView / ExplosionPermaView): which segments and
// discs get stamped into the never-cleared mark buffer this frame. The stamping
// itself is the GL effect in gl.ts; this decides the geometry. Deterministic
// given its random source.
import {
  PERMA_BACK, PERMA_DEPTH_LEVELS, PERMA_EXPLOSION_RIM_ALPHA, PERMA_LINE_ALPHA, PERMA_NEUTRINO_ALPHA,
  PERMA_WIDTH,
} from './constants';
import { maxJump } from './strands';
import type { TrailSource } from './sources';
import type { ExplosionSnapshot } from '../../../../../lib/particulars/sim/snapshot';

/** Floats per mark vertex: x, y (world), alpha, depth (0..1). */
export const MARK_FLOATS = 4;
/** Vertices per segment: three quads across (fade, solid, fade) as triangles. */
export const SEGMENT_VERTS = 18;

/** Across the segment: PermaTrailsManager's mesh, x at ±0.5 / ±0.25 with alpha 0 / 1. */
const ACROSS = [-0.5, -0.25, 0.25, 0.5] as const;
const ACROSS_ALPHA = [0, 1, 1, 0] as const;

export class MarkTracker {
  private last = new Map<number, { x: number; y: number; depth: number }>();
  private seen = new Set<number>();
  data = new Float32Array(64 * SEGMENT_VERTS * MARK_FLOATS);
  /** Vertices written by the last `update`. */
  count = 0;

  constructor(private readonly random: () => number = Math.random) {}

  /**
   * One segment per source from where it was last frame to where it is now.
   * New sources get a random depth (PermaTrailView.OnSpawned) and no segment yet.
   */
  update(sources: readonly TrailSource[], dt: number): void {
    this.count = 0;
    this.seen.clear();
    for (const s of sources) {
      this.seen.add(s.key);
      const prev = this.last.get(s.key);
      if (!prev) {
        // Depth 0..252 of 256: 1.0 stays free as the cleared / wiped value.
        this.last.set(s.key, { x: s.x, y: s.y, depth: Math.floor(this.random() * PERMA_DEPTH_LEVELS) / 256 });
        continue;
      }
      const dist = Math.hypot(s.x - prev.x, s.y - prev.y);
      if (dist > 1e-6 && dist < maxJump(s.speed, dt)) {
        this.segment(prev.x, prev.y, s.x, s.y, prev.depth, s.neutrino ? PERMA_NEUTRINO_ALPHA : PERMA_LINE_ALPHA);
      }
      prev.x = s.x;
      prev.y = s.y;
    }
    for (const key of this.last.keys()) if (!this.seen.has(key)) this.last.delete(key);
  }

  private segment(x0: number, y0: number, x1: number, y1: number, depth: number, alpha: number): void {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const ux = (x1 - x0) / len;
    const uy = (y1 - y0) / len;
    // Matrix4x4.TRS(start, FromToRotation(up, dir), (0.2, dist, 1)): mesh y from -0.1 to 1.
    const bx = x0 - ux * len * PERMA_BACK;
    const by = y0 - uy * len * PERMA_BACK;
    const nx = -uy * PERMA_WIDTH;
    const ny = ux * PERMA_WIDTH;
    if ((this.count + SEGMENT_VERTS) * MARK_FLOATS > this.data.length) {
      const next = new Float32Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    for (let q = 0; q < 3; q++) {
      const a0 = ACROSS[q], a1 = ACROSS[q + 1];
      const al0 = ACROSS_ALPHA[q] * alpha, al1 = ACROSS_ALPHA[q + 1] * alpha;
      // back-left, back-right, front-left / back-right, front-right, front-left
      this.vert(bx + nx * a0, by + ny * a0, al0, depth);
      this.vert(bx + nx * a1, by + ny * a1, al1, depth);
      this.vert(x1 + nx * a0, y1 + ny * a0, al0, depth);
      this.vert(bx + nx * a1, by + ny * a1, al1, depth);
      this.vert(x1 + nx * a1, y1 + ny * a1, al1, depth);
      this.vert(x1 + nx * a0, y1 + ny * a0, al0, depth);
    }
  }

  private vert(x: number, y: number, a: number, d: number): void {
    const o = this.count * MARK_FLOATS;
    this.data[o] = x;
    this.data[o + 1] = y;
    this.data[o + 2] = a;
    this.data[o + 3] = d;
    this.count++;
  }
}

/**
 * permaTrail-explosion.shader, for a sphere seen face-on: `d` is the view-facing
 * component of the normal at fraction `r` of the radius; the rim band sits where
 * d ∈ (0, 0.15), peaking at 0.1. The sphere writes (0,0,0, rim) with Blend One Zero,
 * so inside the explosion every mark is wiped and only the faint rim remains.
 */
export function explosionRimAlpha(r: number): number {
  if (r >= 1) return 0;
  const d = Math.sqrt(1 - r * r);
  const d2 = 1 - smoothstep(0.1, 0.15, d) - (1 - smoothstep(0, 0.1, d));
  return d2 * PERMA_EXPLOSION_RIM_ALPHA;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Explosions that stamp this frame: every live one, at its current radius. */
export function explosionDiscs(explosions: readonly ExplosionSnapshot[]): { x: number; y: number; r: number }[] {
  return explosions.filter((e) => e.radius > 0).map((e) => ({ x: e.x, y: e.y, r: e.radius }));
}
