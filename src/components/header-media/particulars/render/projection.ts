import type { Projection, ViewBox } from './types';

/** The `xMidYMid meet` fit of `view` into a box of cssW × cssH CSS pixels, in device pixels. Pure. */
export function projectionFor(view: ViewBox, cssW: number, cssH: number, dpr: number): Projection {
  const width = Math.max(1, Math.round(cssW * dpr));
  const height = Math.max(1, Math.round(cssH * dpr));
  const scale = Math.min(width / view.width, height / view.height);
  return {
    scale,
    offsetX: (width - view.width * scale) / 2,
    offsetY: (height - view.height * scale) / 2,
    width,
    height,
    dpr,
  };
}
