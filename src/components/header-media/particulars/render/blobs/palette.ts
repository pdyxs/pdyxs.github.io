// Blob outline colours per site theme. Pure.
//
// The original never changed blob colours for its pale chapters: the chapter
// gradients (Scenes/Levels/Progressions/Chapter N.asset, levelTweenGradients[2]
// = BlobColourPos, [3] = BlobColourNeg) keep pos #141414–#282828 and neg
// #e1e1e1 (chapters 1, 2, 6, 7) or pure #000000 / #ffffff (chapters 3, 4, 8–10),
// even where the background is white (chapter 7 opens on #ffffff). The light
// outline only read there because it hugged a black antimatter sprite. On the
// site's light paper it needs help, so light mode takes the original's pure
// white and adds a faint graphite edge on the antimatter side only.
import type { Theme } from '../types';
import { BLOB_COLOUR_NEG, BLOB_COLOUR_POS } from './constants';

export type Rgb = readonly [number, number, number];

export interface BlobPalette {
  /** Outline round matter (parity +1). */
  pos: Rgb;
  /** Outline round antimatter (parity −1). */
  neg: Rgb;
  /** A thin edge drawn either side of the antimatter outline; alpha 0 means none. */
  edge: Rgb;
  edgeAlpha: number;
}

const hex = (h: string): Rgb => [
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255,
];

/** Dark mode: GameScene.unity's RenderBlobs colours, unchanged. */
export const DARK: BlobPalette = { pos: BLOB_COLOUR_POS, neg: BLOB_COLOUR_NEG, edge: [0, 0, 0], edgeAlpha: 0 };

/**
 * Light mode, on the charge layer's ~#e3e4e1 paper: matter takes the SVG's
 * graphite ink (#3a3c3b) — a touch lighter than #282828, so it doesn't weigh
 * down the white matter sprites; antimatter takes the original's pure white
 * (chapters 3/4/8–10) with a soft graphite edge so it reads on pale paper.
 */
export const LIGHT: BlobPalette = { pos: hex('#3a3c3b'), neg: hex('#ffffff'), edge: hex('#3a3c3b'), edgeAlpha: 0.6 };

/** The paper the light palette is judged against (charge layer's light background). */
export const LIGHT_PAPER: Rgb = hex('#e3e4e1');

/** Edge width either side of the antimatter line: CSS px for the analytic variants, alpha units for 'unity'. */
export const EDGE_CSS_PX = 1;
export const EDGE_ALPHA_WIDTH = 0.07;

export function blobPalette(theme: Theme): BlobPalette {
  return theme === 'light' ? LIGHT : DARK;
}

/** WCAG relative luminance, for tests and judgement. */
export function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two colours (1..21). */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
