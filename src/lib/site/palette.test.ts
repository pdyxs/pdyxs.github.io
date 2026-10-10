import { describe, it, expect } from 'vitest';
import {
  PALETTE_SYSTEMS,
  DEFAULT_PALETTE,
  axis,
  contrastRatio,
  findSystem,
  hueBump,
  warpedHue,
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

describe('hue shaping', () => {
  const bands = [
    { centre: 150, halfWidth: 45, stretch: 1.5 },
    { centre: 80, halfWidth: 35, stretch: -0.6 },
    { centre: 215, halfWidth: 40, stretch: -0.6 },
  ];
  const share = (b: typeof bands, from: number, to: number) => {
    let n = 0;
    for (let i = 0; i < 1000; i++) {
      const h = warpedHue(265, i / 1000, b) % 360;
      if (h >= from && h < to) n++;
    }
    return n / 1000;
  };

  it('bumps 1 at the centre, 0 outside the band, across the 0/360 seam', () => {
    expect(hueBump(150, 150, 75)).toBe(1);
    expect(hueBump(250, 150, 75)).toBe(0);
    expect(hueBump(350, 10, 40)).toBeCloseTo(0.5, 5);
  });

  it('warps a full sweep from h0 once round, monotonically', () => {
    expect(warpedHue(265, 0, bands)).toBeCloseTo(265, 5);
    expect(warpedHue(265, 1, bands)).toBeCloseTo(625, 5);
    let prev = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const h = warpedHue(265, i / 100, bands);
      expect(h).toBeGreaterThan(prev);
      prev = h;
    }
  });

  it('with no bands it is the even sweep', () => {
    expect(warpedHue(265, 0.25, [])).toBeCloseTo(355, 1);
  });

  it('green grows at the expense of khaki and slate, not purple', () => {
    expect(share(bands, 120, 170)).toBeGreaterThan(share([], 120, 170) * 1.8);
    expect(share(bands, 70, 120)).toBeLessThan(share([], 70, 120));
    expect(share(bands, 200, 250)).toBeLessThan(share([], 200, 250));
    expect(share(bands, 280, 350)).toBeCloseTo(share([], 280, 350), 1);
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
