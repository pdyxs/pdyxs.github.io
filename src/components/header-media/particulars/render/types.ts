// The contract between Toy.svelte and a visual layer. A layer owns one <canvas>
// stacked over or under the SVG, reads the plain Snapshot each animation frame,
// and draws. It never reaches into the World or the SVG.
import type { Snapshot } from '../../../../lib/particulars/sim/snapshot';

/** The world-space rectangle the SVG shows (its viewBox). */
export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * World → canvas pixels, matching the SVG's `xMidYMid meet` fit exactly.
 * canvasX = (worldX - view.x) * scale + offsetX (same for y). Pixels are device
 * pixels: the canvas backing store is already multiplied by devicePixelRatio.
 */
export interface Projection {
  scale: number;
  offsetX: number;
  offsetY: number;
  /** Backing-store size in device pixels. */
  width: number;
  height: number;
  dpr: number;
}

export interface FrameInfo {
  snapshot: Snapshot;
  view: ViewBox;
  projection: Projection;
  /** Real seconds since the previous animation frame (clamped to 0.1). */
  dt: number;
  /** Seconds since the layer was created. */
  time: number;
  /** True when the snapshot advanced at least one sim step since the last frame. */
  stepped: boolean;
  /**
   * The site's colour mode, read every frame from `<html data-theme>` (the site's single
   * source of truth; it can change at any time). Layers pick their palette from it.
   */
  theme: Theme;
}

export type Theme = 'light' | 'dark';

export interface Layer {
  /** Called once per animation frame. Draw the whole layer (or update persistent buffers). */
  frame(f: FrameInfo): void;
  /** The canvas changed size: backing stores were reset. */
  resize?(projection: Projection): void;
  destroy(): void;
}

/** Stacking: negative draws under the SVG, positive over it. Ties draw in registry order. */
export interface LayerDef {
  id: string;
  z: number;
  /** Variant names for experiments. 'off' is always implied and need not be listed. */
  variants: readonly string[];
  /** What the toy uses when no `?pv-<id>=` query parameter says otherwise. 'off' is allowed. */
  defaultVariant: string;
  /** When this layer is on, the SVG hides its own particle glyphs (the layer draws the particles). */
  replacesGlyphs?: boolean;
  /** When this layer is on, it paints the level background, so the SVG switches to light ink. */
  paintsBackground?: boolean;
  /** 'webgl2' or '2d' etc. are the layer's own business: it calls canvas.getContext itself. */
  create(canvas: HTMLCanvasElement, variant: string): Layer;
}

/** Plain helper so layers don't re-derive the projection maths. */
export function toCanvas(p: Projection, view: ViewBox, x: number, y: number): { x: number; y: number } {
  return { x: (x - view.x) * p.scale + p.offsetX, y: (y - view.y) * p.scale + p.offsetY };
}
