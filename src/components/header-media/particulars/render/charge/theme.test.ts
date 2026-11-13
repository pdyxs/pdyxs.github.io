import { describe, expect, it } from 'vitest';
import { GRAPHITE, LIGHT_BACKGROUND_HEX, PAPER, THEMED } from './palette';
import { mixPalette, paletteFor, shownPalette, stepPaletteFade } from './theme';

const toHex = (c: readonly number[]) => '#' + c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

describe('paletteFor', () => {
  it('picks the dark palette in dark mode and the paper in light mode', () => {
    expect(paletteFor(THEMED.graphite, 'dark')).toBe(GRAPHITE);
    expect(paletteFor(THEMED.graphite, 'light')).toBe(PAPER);
  });

  it('puts every light palette on the shared paper', () => {
    for (const t of Object.values(THEMED)) expect(toHex(t.light.neutral)).toBe(LIGHT_BACKGROUND_HEX);
  });

  it('only darkens the paper in light mode', () => {
    const lum = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    for (const t of Object.values(THEMED)) {
      expect(lum(t.light.pos)).toBeLessThan(lum(t.light.neutral));
      expect(lum(t.light.neg)).toBeLessThan(lum(t.light.neutral));
    }
  });
});

describe('palette fade', () => {
  it('mixes channel by channel', () => {
    expect(mixPalette(GRAPHITE, PAPER, 0)).toEqual(GRAPHITE);
    expect(mixPalette(GRAPHITE, PAPER, 1).pos).toEqual(PAPER.pos);
  });

  it('crossfades to a new target and settles on it', () => {
    let f = { from: GRAPHITE, to: GRAPHITE, t: 1 };
    f = stepPaletteFade(f, PAPER, 0.1, 0.4);
    expect(f.to).toBe(PAPER);
    expect(f.t).toBeCloseTo(0.25);
    for (let i = 0; i < 10; i++) f = stepPaletteFade(f, PAPER, 0.1, 0.4);
    expect(shownPalette(f)).toBe(PAPER);
  });

  it('restarts from what is on screen when the target flips mid-fade', () => {
    let f = { from: GRAPHITE, to: PAPER, t: 0.5 };
    const onScreen = shownPalette(f);
    f = stepPaletteFade(f, GRAPHITE, 0, 0.4);
    expect(shownPalette(f)).toEqual(onScreen);
  });
});
