// Monochrome icon definitions for lenses. Keyed by the `icon` field in the
// lens registry — that field stays a semantic *key*, never markup, so the
// registry remains pure data (see lens-registry.ts). Resolution key -> shape
// data lives here, the rendering layer; LensIcon.svelte turns a def into real
// declarative SVG elements.
//
// Why structured shapes rather than raw SVG strings: an `{@html}` SVG string
// doesn't round-trip byte-identically through the browser's parser, so Svelte
// flags a (benign) hydration mismatch. Emitting real <line>/<circle>/<polyline>
// elements from data sidesteps that entirely and stays type-safe.
//
// All icons draw on a uniform 0 0 24 24 viewBox in `currentColor`, so a single
// def works on a light lens-list row and the dark indicator strip alike, and
// the caller sizes it purely via font-size (the <svg> is 1em square).

export type IconShape =
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'polyline'; points: string };

export interface LensIconDef {
  /** Filled shapes (scatter/dot) vs stroked outlines (the timelines). */
  filled: boolean;
  shapes: IconShape[];
}

const c = (cx: number, cy: number, r: number): IconShape => ({ kind: 'circle', cx, cy, r });
const l = (x1: number, y1: number, x2: number, y2: number): IconShape => ({ kind: 'line', x1, y1, x2, y2 });

const LENS_ICONS: Record<string, LensIconDef> = {
  // "A bit of everything" — a scatter plot stripped of its axes: dots strewn
  // across the field with no ordering, standing in for a varied mix.
  scatter: {
    filled: true,
    shapes: [
      c(5, 7, 1.7), c(11, 4, 1.7), c(17, 8, 1.7), c(7, 14, 1.7),
      c(13, 12, 1.7), c(20, 15, 1.7), c(9, 20, 1.7), c(17, 20, 1.7),
    ],
  },

  // "Newest" — a time axis with a tall origin tick at the left and an arrowhead
  // at the leading (right) end: advancing toward the most recent point. Its
  // mirror `timeline-oldest` (tall tick right, arrow left) powers the Oldest lens.
  timeline: {
    filled: false,
    shapes: [
      l(3.5, 5.5, 3.5, 18.5),
      l(3.5, 12, 20.5, 12),
      l(9.5, 9.5, 9.5, 14.5),
      l(15, 9.5, 15, 14.5),
      { kind: 'polyline', points: '17,8 21,12 17,16' },
    ],
  },

  'timeline-oldest': {
    filled: false,
    shapes: [
      l(20.5, 5.5, 20.5, 18.5),
      l(3.5, 12, 20.5, 12),
      l(14.5, 9.5, 14.5, 14.5),
      l(9, 9.5, 9, 14.5),
      { kind: 'polyline', points: '7,8 3,12 7,16' },
    ],
  },

  // Generic fallback marker for a lens that declares no icon (or an unknown
  // key) — mirrors the old '●' text marker.
  dot: { filled: true, shapes: [c(12, 12, 4)] },
};

/**
 * Resolves a lens icon key to its shape definition. Returns undefined for a
 * missing key (no icon to show); an unknown key falls back to the generic dot
 * so a typo degrades to a visible marker rather than nothing.
 */
export function lensIconDef(name: string | undefined | null): LensIconDef | undefined {
  if (!name) return undefined;
  return LENS_ICONS[name] ?? LENS_ICONS.dot;
}
