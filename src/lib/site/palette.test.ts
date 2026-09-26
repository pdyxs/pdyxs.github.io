import { describe, it, expect } from 'vitest';
import {
  PALETTE_SYSTEMS,
  DEFAULT_PALETTE,
  axis,
  contrastRatio,
  findSystem,
  formatOklch,
  hslToOklch,
  parseOklch,
  parsePalette,
  swatch,
  toGamut,
  toRgb255,
} from '@site/palette';

const OKLCH = /^oklch\(\S+ \S+ \S+\)$/;
const grid = Array.from({ length: 21 }, (_, i) => i / 20);

describe('colour maths', () => {
  it('the default palette is exactly white and black', () => {
    expect(toRgb255(DEFAULT_PALETTE.light.srgb)).toEqual([255, 255, 255]);
    expect(toRgb255(DEFAULT_PALETTE.dark.srgb)).toEqual([0, 0, 0]);
    expect(DEFAULT_PALETTE.light.p3).toBe(DEFAULT_PALETTE.light.srgb);
  });

  it('gamut mapping keeps lightness and hue, gives up chroma', () => {
    const fit = toGamut({ L: 0.3, C: 0.8, h: 175 }, 'srgb');
    expect(fit.L).toBe(0.3);
    expect(fit.h).toBe(175);
    expect(fit.C).toBeGreaterThan(0.04);
    expect(fit.C).toBeLessThan(0.08);
  });

  it('P3 holds more chroma than sRGB, and never less', () => {
    for (let h = 0; h < 360; h += 15) {
      const c = { L: 0.3, C: 0.4, h };
      expect(toGamut(c, 'p3').C).toBeGreaterThanOrEqual(toGamut(c, 'srgb').C);
    }
    const teal = { L: 0.3, C: 0.4, h: 175 };
    expect(toGamut(teal, 'p3').C).toBeGreaterThan(toGamut(teal, 'srgb').C * 1.2);
  });

  it('formats and parses oklch() strings', () => {
    expect(formatOklch({ L: 0.3, C: 0.123456, h: 265.555 })).toBe('oklch(0.3 0.1234 265.56)');
    expect(formatOklch({ L: 1, C: 0, h: 90 })).toBe('oklch(1 0 0)');
    expect(parseOklch('oklch(0.3 0.1234 265.56)')).toEqual({ L: 0.3, C: 0.1234, h: 265.56 });
    expect(parseOklch('#000000')).toBeNull();
  });

  it('hsl primaries land on the sRGB primaries (±1 from string rounding)', () => {
    const cases: [number, number[]][] = [[0, [255, 0, 0]], [120, [0, 255, 0]], [240, [0, 0, 255]]];
    for (const [h, want] of cases) {
      const got = toRgb255(formatOklch(hslToOklch(h, 1, 0.5)))!;
      got.forEach((v, i) => expect(Math.abs(v - want[i])).toBeLessThanOrEqual(1));
    }
  });

  it('contrast ratio of black on white is 21', () => {
    expect(contrastRatio(DEFAULT_PALETTE.light.srgb, DEFAULT_PALETTE.dark.srgb)).toBeCloseTo(21, 3);
  });
});

describe('axis', () => {
  it('starts with a deadzone, ramps, then sweeps hue', () => {
    expect(axis(0)).toEqual({ t: 0, turn: 0 });
    expect(axis(0.02)).toEqual({ t: 0, turn: 0 });
    expect(axis(0.08).t).toBeGreaterThan(0);
    expect(axis(0.08).turn).toBe(0);
    expect(axis(0.12)).toEqual({ t: 1, turn: 0 });
    expect(axis(1)).toEqual({ t: 1, turn: 360 });
  });

  it('clamps outside the viewport', () => {
    expect(axis(-1)).toEqual(axis(0));
    expect(axis(2)).toEqual(axis(1));
  });
});

describe.each(PALETTE_SYSTEMS)('system $id', (system) => {
  it('the top-left corner is the default palette', () => {
    expect(system.pick({ x: 0, y: 0 })).toEqual(DEFAULT_PALETTE);
  });

  it('always yields valid hex with readable contrast', () => {
    for (const x of grid) {
      for (const y of grid) {
        const p = system.pick({ x, y });
        for (const c of [p.light.srgb, p.light.p3, p.dark.srgb, p.dark.p3]) expect(c).toMatch(OKLCH);
        expect(contrastRatio(p.light.srgb, p.dark.srgb)).toBeGreaterThanOrEqual(7);
      }
    }
  });

  it('a full hue turn along x comes back to where the sweep started', () => {
    expect(system.pick({ x: 1, y: 0.5 })).toEqual(system.pick({ x: 0.12, y: 0.5 }));
  });
});

describe('findSystem', () => {
  it('falls back to the first system for an unknown id', () => {
    expect(findSystem('nope')).toBe(PALETTE_SYSTEMS[0]);
    expect(findSystem(null)).toBe(PALETTE_SYSTEMS[0]);
  });
});

describe('parsePalette', () => {
  it('round-trips a stored palette', () => {
    const p = { light: swatch({ L: 0.95, C: 0.04, h: 90 }), dark: swatch({ L: 0.3, C: 0.2, h: 265 }) };
    expect(parsePalette(JSON.stringify(p))).toEqual(p);
  });

  it('rejects missing, malformed, legacy-hex and partial values', () => {
    expect(parsePalette(null)).toBeNull();
    expect(parsePalette('{')).toBeNull();
    expect(parsePalette('null')).toBeNull();
    expect(parsePalette('{"light":"#fafafa","dark":"#101010"}')).toBeNull();
    expect(
      parsePalette(JSON.stringify({ light: { srgb: 'oklch(1 0 0)' }, dark: DEFAULT_PALETTE.dark })),
    ).toBeNull();
  });
});
