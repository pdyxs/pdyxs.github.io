// outline: the cut line of a set as SVG path data in mm. Pure.

import type { ComponentSet } from '../model/types.ts';
import { geometryOf } from '../model/query.ts';

export interface CutOutline {
  cutPath: string;
  size: { width: number; height: number };
  bleed: number;
}

export function outline(set: Pick<ComponentSet, 'size' | 'bleed' | 'outline'>): CutOutline {
  const { size, bleed, outline } = geometryOf(set);
  const { width: w, height: h } = size;
  const r = Math.min(Math.max(outline.radius ?? 0, 0), w / 2, h / 2);
  if (r === 0) return { cutPath: `M0 0H${w}V${h}H0Z`, size, bleed };
  const arc = (x: number, y: number) => `A${r} ${r} 0 0 1 ${x} ${y}`;
  const cutPath = `M${r} 0H${w - r}${arc(w, r)}V${h - r}${arc(w - r, h)}H${r}${arc(0, h - r)}V${r}${arc(r, 0)}Z`;
  return { cutPath, size, bleed };
}
