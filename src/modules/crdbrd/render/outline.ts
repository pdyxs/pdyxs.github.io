// outline: the cut line of a set as SVG path data in mm. Pure. The single
// source of a set's cut geometry: the preview, and later print-and-play, read it.

import type { ComponentSet } from '../model/types.ts';
import { geometryOf } from '../model/query.ts';
import { validPathData } from '../model/path.ts';

type Size = { width: number; height: number };

export interface CutOutline {
  cutPath: string;
  size: Size;
  bleed: number;
}

function rectangle(size: Size, radius: number | undefined): { cutPath: string; size: Size } {
  const { width: w, height: h } = size;
  const r = Math.min(Math.max(radius ?? 0, 0), w / 2, h / 2);
  if (r === 0) return { cutPath: `M0 0H${w}V${h}H0Z`, size };
  const arc = (x: number, y: number) => `A${r} ${r} 0 0 1 ${x} ${y}`;
  return { cutPath: `M${r} 0H${w - r}${arc(w, r)}V${h - r}${arc(w - r, h)}H${r}${arc(0, h - r)}V${r}${arc(r, 0)}Z`, size };
}

const round = (n: number) => Math.round(n * 1000) / 1000;
const polygon = (points: [number, number][]) => `M${points.map(([x, y]) => `${round(x)} ${round(y)}`).join('L')}Z`;

/** A regular hexagon; `across` is the distance the set width stands for. */
function hexagon(across: number, orientation: 'pointy' | 'flat', measure: 'flat-to-flat' | 'point-to-point'): { cutPath: string; size: Size } {
  const s = measure === 'flat-to-flat' ? across / Math.sqrt(3) : across / 2;
  const flats = Math.sqrt(3) * s;
  const points = 2 * s;
  if (orientation === 'flat') {
    const w = points, h = flats;
    return { cutPath: polygon([[0, h / 2], [s / 2, 0], [1.5 * s, 0], [w, h / 2], [1.5 * s, h], [s / 2, h]]), size: { width: round(w), height: round(h) } };
  }
  const w = flats, h = points;
  return { cutPath: polygon([[w / 2, 0], [w, s / 2], [w, 1.5 * s], [w / 2, h], [0, 1.5 * s], [0, s / 2]]), size: { width: round(w), height: round(h) } };
}

export function outline(set: Pick<ComponentSet, 'size' | 'bleed' | 'outline'>): CutOutline {
  const { size, bleed, outline } = geometryOf(set);
  switch (outline.kind) {
    case 'circle': {
      const d = size.width;
      const r = d / 2;
      return { cutPath: `M0 ${r}A${r} ${r} 0 0 1 ${d} ${r}A${r} ${r} 0 0 1 0 ${r}Z`, size: { width: d, height: d }, bleed };
    }
    case 'hexagon':
      return { ...hexagon(size.width, outline.orientation, outline.measure), bleed };
    case 'custom':
      if (validPathData(outline.path)) return { cutPath: outline.path.trim(), size, bleed };
      return { ...rectangle(size, 0), bleed };
    default:
      return { ...rectangle(size, outline.kind === 'rectangle' ? outline.radius : 0), bleed };
  }
}
