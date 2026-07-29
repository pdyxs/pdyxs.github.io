// Monochrome icon definitions for lenses. Keyed by the `icon` field in the
// lens registry — that field stays a semantic *key*, never markup, so the
// registry remains pure data (see lens-registry.ts). Resolution key -> shape
// data lives here, the rendering layer; LensIcon.svelte turns a def into real
// declarative SVG elements.
//
// Why structured shapes rather than raw SVG strings: an `{@html}` SVG string
// doesn't round-trip byte-identically through the browser's parser, so Svelte
// flags a (benign) hydration mismatch. Emitting real <path>/<line>/<circle>/
// <polyline> elements from data sidesteps that entirely and stays type-safe.
//
// All icons draw on a uniform 0 0 24 24 viewBox in `currentColor`, so a single
// def works on a light lens-list row and the dark indicator strip alike, and
// the caller sizes it purely via font-size (the <svg> is 1em square).
//
// The definitions themselves live in lens-icons.generated.ts, built by
// scripts/generate-lens-icons.mjs from the editable SVG sources in
// src/icons/lenses/*.svg (edit those — e.g. in Affinity Designer — and run
// `npm run generate:lens-icons`, never hand-edit the generated file). `circle`/
// `line`/`polyline` stay in the type for cheap hand-authored defs, but the
// generator only ever emits `path`.

import { LENS_ICON_DEFS } from '../data/lens-icons.generated';

export type IconShape =
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'polyline'; points: string }
  | { kind: 'path'; d: string };

export interface LensIconDef {
  /** Filled shapes (scatter/dot) vs stroked outlines (the timelines). */
  filled: boolean;
  shapes: IconShape[];
}

const LENS_ICONS: Record<string, LensIconDef> = LENS_ICON_DEFS;

/**
 * Resolves a lens icon key to its shape definition. Returns undefined for a
 * missing key (no icon to show); an unknown key falls back to the generic dot
 * so a typo degrades to a visible marker rather than nothing.
 */
export function lensIconDef(name: string | undefined | null): LensIconDef | undefined {
  if (!name) return undefined;
  return LENS_ICONS[name] ?? LENS_ICONS.dot;
}
