import { describe, it, expect } from 'vitest';
import { FALLBACK_DOT_INK, dotInSlot, inkBounds, inkEm, plausibleDotInk } from '@site/mark/measure';

/** An RGBA buffer with the given pixels set to alpha `a`. */
function buffer(width: number, height: number, inked: [number, number, number?][]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y, a = 255] of inked) data[(y * width + x) * 4 + 3] = a;
  return data;
}

describe('inkBounds', () => {
  it('is null on a blank canvas', () => {
    expect(inkBounds(buffer(8, 8, []), 8, 8)).toBeNull();
  });

  it('boxes every inked pixel, the far edges exclusive', () => {
    const data = buffer(10, 10, [[2, 3], [5, 3], [3, 6]]);
    expect(inkBounds(data, 10, 10)).toEqual({ x0: 2, y0: 3, x1: 6, y1: 7 });
  });

  it('counts an anti-aliased edge only from half coverage', () => {
    const data = buffer(10, 10, [[4, 4], [3, 4, 127], [5, 4, 128]]);
    expect(inkBounds(data, 10, 10)).toEqual({ x0: 4, y0: 4, x1: 6, y1: 5 });
  });
});

describe('inkEm', () => {
  it('measures from the pen and the baseline, in em', () => {
    const ink = inkEm({ x0: 113, y0: 280, x1: 132, y1: 300 }, { x: 100, y: 300 }, 200);
    expect(ink.left).toBeCloseTo(0.065);
    expect(ink.right).toBeCloseTo(0.16);
    expect(ink.top).toBeCloseTo(-0.1);
    expect(ink.bottom).toBe(0);
  });
});

describe('plausibleDotInk', () => {
  it('accepts the fallback, which is a real full stop', () => {
    expect(plausibleDotInk(FALLBACK_DOT_INK)).toBe(true);
  });

  it('rejects a box too wide, too tall, or off the baseline', () => {
    // An em-wide box: a fallback font's tofu, or another glyph.
    expect(plausibleDotInk({ left: 0, right: 0.6, top: -0.6, bottom: 0 })).toBe(false);
    // A comma's tail, or a colon: twice as tall as it is wide.
    expect(plausibleDotInk({ left: 0, right: 0.1, top: -0.3, bottom: 0 })).toBe(false);
    // Floating at x-height, not standing on the baseline.
    expect(plausibleDotInk({ left: 0, right: 0.1, top: -0.5, bottom: -0.4 })).toBe(false);
    // Under the threshold of anything readable.
    expect(plausibleDotInk({ left: 0, right: 0.01, top: -0.01, bottom: 0 })).toBe(false);
  });
});

describe('dotInSlot', () => {
  it('sizes the dot by the ink width, at the font size', () => {
    expect(dotInSlot(FALLBACK_DOT_INK, 54, 61).size).toBeCloseTo(5.13, 2);
  });

  it('centres it on the ink, relative to the slot box', () => {
    // The title at 1280: 54px Saira Stencil, its baseline 61px into the box.
    const { centre } = dotInSlot(FALLBACK_DOT_INK, 54, 61);
    expect(centre.x).toBeCloseTo(((0.065 + 0.16) / 2) * 54);
    expect(centre.y).toBeCloseTo(61 - 0.05 * 54);
  });

  it('scales with the font: half the size, half the offsets', () => {
    const big = dotInSlot(FALLBACK_DOT_INK, 54, 0);
    const small = dotInSlot(FALLBACK_DOT_INK, 27, 0);
    expect(small.size).toBeCloseTo(big.size / 2);
    expect(small.centre.x).toBeCloseTo(big.centre.x / 2);
    expect(small.centre.y).toBeCloseTo(big.centre.y / 2);
  });
});
