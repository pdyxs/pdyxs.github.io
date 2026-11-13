import { describe, expect, it } from 'vitest';
import { BLOB_COLOUR_NEG, BLOB_COLOUR_POS } from './constants';
import { blobPalette, contrast, LIGHT_PAPER } from './palette';

describe('blobPalette', () => {
  it('keeps the Unity colours in dark mode, with no edge', () => {
    const p = blobPalette('dark');
    expect(p.pos).toEqual(BLOB_COLOUR_POS);
    expect(p.neg).toEqual(BLOB_COLOUR_NEG);
    expect(p.edgeAlpha).toBe(0);
  });

  it('gives light mode a matter outline that reads on the paper', () => {
    expect(contrast(blobPalette('light').pos, LIGHT_PAPER)).toBeGreaterThan(4.5);
  });

  it('separates the antimatter outline from the paper by its edge, since white alone barely differs', () => {
    const p = blobPalette('light');
    expect(contrast(p.neg, LIGHT_PAPER)).toBeLessThan(1.5);
    expect(p.edgeAlpha).toBeGreaterThan(0);
    expect(contrast(p.edge, LIGHT_PAPER)).toBeGreaterThan(4.5);
  });

  it('keeps matter and antimatter outlines distinct in both themes', () => {
    for (const t of ['light', 'dark'] as const) {
      const p = blobPalette(t);
      expect(contrast(p.pos, p.neg)).toBeGreaterThan(4.5);
    }
  });
});
