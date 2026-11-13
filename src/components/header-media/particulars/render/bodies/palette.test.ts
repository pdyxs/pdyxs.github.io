import { describe, expect, it } from 'vitest';
import { paletteFor, TRAILER, TRAILER_LIGHT, UNITY, UNITY_LIGHT, type Rgba } from './palette';

const set = { dark: UNITY, light: UNITY_LIGHT };
/** Relative luminance (sRGB, WCAG). */
const lum = (c: Rgba) => {
  const ch = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]);
};
const contrast = (a: Rgba, b: Rgba) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
const WHITE: Rgba = [1, 1, 1, 1];

describe('paletteFor', () => {
  it('follows the site mode', () => {
    expect(paletteFor(set, 'dark')).toBe(UNITY);
    expect(paletteFor(set, 'light')).toBe(UNITY_LIGHT);
  });

  it('leaves dark mode as the original: no rim, white spawners', () => {
    expect(UNITY.rim).toBeNull();
    expect(UNITY.spawnMatter).toEqual(WHITE);
  });

  it('rims bodies and inks the matter spawner in light mode', () => {
    for (const p of [UNITY_LIGHT, TRAILER_LIGHT]) {
      expect(p.rim).not.toBeNull();
      expect(lum(p.spawnMatter)).toBeLessThan(0.1);
    }
  });

  it('keeps every strong colour readable on the white pupil in light mode', () => {
    for (const c of Object.values(UNITY_LIGHT.strong)) expect(contrast(c, WHITE)).toBeGreaterThan(3);
  });

  it("keeps the player's iris distinct from its white body in both modes", () => {
    for (const p of [UNITY, TRAILER, UNITY_LIGHT, TRAILER_LIGHT]) expect(contrast(p.player, WHITE)).toBeGreaterThan(2.2);
  });
});
