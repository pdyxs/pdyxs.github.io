// Where the full stop's ink is, so the suspended mark's dot can sit exactly on
// it. Pure: pixels and metrics in, a box out. The DOM and canvas reads that
// feed it are in SuspendedMark.astro.
//
// Why not `measureText`'s `actualBoundingBox*`: the experiment used them, and
// slice 2 of docs/plans/suspended-mark.md found the same glyph measured 6px wide
// in Chromium and 12px in WebKit. So the ink is found the slow, honest way: the
// period is drawn into an offscreen canvas at a large size and its pixels are
// scanned (`inkBounds`), which only needs the engine to rasterise the glyph, not
// to report on it. The result is kept in em (`inkEm`), so one scan serves every
// title size. If the scan can't be trusted — the font isn't usable in canvas,
// or the box it finds isn't a plausible full stop — `FALLBACK_DOT_INK` is used
// instead: the same measurement taken once in Chromium, as em fractions.
//
// The baseline is the other half, and the canvas can't give it either: where
// the baseline sits inside an inline box is the font's ascent as the CSS engine
// resolves it, which is again per-engine. The mark reads it off a probe laid
// out by the engine itself (an empty inline-block's bottom edge is the
// baseline), so `dotInSlot` is handed it as a measured length.

import type { V } from '@site/mark/geometry';

/** A pixel box: x0/y0 inclusive, x1/y1 exclusive. */
export interface PixelBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The box around every pixel at least `threshold` opaque, in an RGBA buffer
 * (canvas `ImageData.data`). Half coverage is where an anti-aliased edge
 * really is, so the default threshold puts the box on the glyph's outline.
 * Null when nothing is inked.
 */
export function inkBounds(rgba: ArrayLike<number>, width: number, height: number, threshold = 128): PixelBox | null {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] < threshold) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/** A glyph's ink box in em: x from the pen position, y from the baseline (down is +). */
export interface InkEm {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** `box`, scanned from a glyph drawn with its pen at `origin` (on the baseline) at `fontPx`, in em. */
export function inkEm(box: PixelBox, origin: V, fontPx: number): InkEm {
  return {
    left: (box.x0 - origin.x) / fontPx,
    right: (box.x1 - origin.x) / fontPx,
    top: (box.y0 - origin.y) / fontPx,
    bottom: (box.y1 - origin.y) / fontPx,
  };
}

/**
 * Whether a scanned box can be a full stop: small, roughly square, and on
 * the baseline. A box that fails this is a misread (another glyph, a fallback
 * font's tofu, a blank canvas), and the fallback is closer than it would be.
 */
export function plausibleDotInk(ink: InkEm): boolean {
  const w = ink.right - ink.left;
  const h = ink.bottom - ink.top;
  return w >= 0.04 && w <= 0.3 && h >= w * 0.6 && h <= w * 1.6 && ink.bottom > -0.1 && ink.bottom < 0.15;
}

/**
 * Saira Stencil's full stop, scanned in Chromium at 200px: 0.095em wide and
 * 0.1em tall, standing on the baseline just right of the pen. Used when the
 * scan can't be trusted. (Scanned at the title's own 54px it reads 0.111em,
 * because at that size a half-covered edge pixel rounds up to a whole one;
 * the DOM draws the outline, not the pixels, and at 54px its ink measures
 * 5.1px, which is 0.095em.)
 */
export const FALLBACK_DOT_INK: InkEm = { left: 0.065, right: 0.16, top: -0.1, bottom: 0 };

/** The dot as the mark draws it: its size, and its centre relative to the slot box's top-left. */
export interface SlotDot {
  size: number;
  centre: V;
}

/**
 * The dot for a slot laid out at `fontPx` whose baseline is `baseline` px below
 * the top of its box. The dot is square (the rig attaches threads to a square),
 * sized by the ink's width.
 */
export function dotInSlot(ink: InkEm, fontPx: number, baseline: number): SlotDot {
  return {
    size: (ink.right - ink.left) * fontPx,
    centre: {
      x: ((ink.left + ink.right) / 2) * fontPx,
      y: baseline + ((ink.top + ink.bottom) / 2) * fontPx,
    },
  };
}
