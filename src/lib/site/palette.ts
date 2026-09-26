/**
 * The user-chosen palette: the two colours (`--color-light`, `--color-dark`)
 * that every token and every dither level on the site is built from.
 *
 * Pure decisions only — a point on the page goes in, two colours come out. The
 * picker (PalettePicker.astro) is the thin applier; the head init script in
 * Base.astro re-applies the stored result before first paint.
 *
 * A point is a pair of fractions of the viewport, x and y in [0, 1]. Each
 * PaletteSystem is one mapping from that point to a palette, so different colour
 * spaces and axis assignments can be compared by swapping the system and nothing
 * else.
 *
 * Colours are emitted as CSS `oklch()` strings, each one already gamut-mapped
 * twice: once into sRGB and once into Display P3. tokens.css picks between the
 * two with `@media (color-gamut: p3)`, so a wide-gamut screen gets the extra
 * chroma and the browser never has to squeeze an out-of-gamut value itself
 * (which in practice means clipping channels and shifting the hue).
 */

export interface Point {
  x: number;
  y: number;
}

export interface Oklch {
  L: number; // 0..1
  C: number; // chroma, ≥ 0
  h: number; // degrees
}

export type Gamut = 'srgb' | 'p3';

/** One colour, as an `oklch()` string fitted to each gamut. */
export type Swatch = Record<Gamut, string>;

export interface Palette {
  light: Swatch;
  dark: Swatch;
}

/** Where an axis stops being black/white and starts turning into colour. */
const DEADZONE = 0.03;
/** Where the black/white → colour ramp ends and the hue sweep begins. */
const RAMP_END = 0.12;

// ── Colour maths ─────────────────────────────────────────────────────

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const gammaEncode = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
const gammaDecode = (c: number) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

type Rgb = [number, number, number];

/** OKLCH → linear sRGB, unclamped (may fall outside [0, 1]). */
function oklchToLinearSrgb({ L, C, h }: Oklch): Rgb {
  const hr = (h * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** Linear sRGB → OKLCH. */
function linearSrgbToOklch([r, g, b]: Rgb): Oklch {
  const l = Math.cbrt(0.4122214708 * r + 0.5363588882 * g + 0.0514633739 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808868259 * s;
  const h = (Math.atan2(B, A) * 180) / Math.PI;
  return { L, C: Math.hypot(A, B), h: h < 0 ? h + 360 : h };
}

/** Linear sRGB → linear Display P3 (both D65). */
const srgbToP3 = ([r, g, b]: Rgb): Rgb => [
  0.8224621 * r + 0.177538 * g,
  0.0331941 * r + 0.9668058 * g,
  0.0170827 * r + 0.0723974 * g + 0.9105199 * b,
];

const inGamut = (c: Oklch, gamut: Gamut) => {
  const srgb = oklchToLinearSrgb(c);
  const rgb = gamut === 'p3' ? srgbToP3(srgb) : srgb;
  return rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);
};

/**
 * Fit a colour into a gamut by keeping lightness and hue and giving up chroma —
 * the CSS Color 4 gamut-mapping intent, done here so every browser renders the
 * same colour.
 */
export function toGamut(c: Oklch, gamut: Gamut): Oklch {
  if (inGamut(c, gamut)) return c;
  let lo = 0;
  let hi = c.C;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut({ ...c, C: mid }, gamut)) lo = mid;
    else hi = mid;
  }
  return { ...c, C: lo };
}

const round = (v: number, dp: number) => Number(v.toFixed(dp));

/** CSS `oklch()` string. Chroma is floored so rounding can never leave the gamut. */
export function formatOklch({ L, C, h }: Oklch): string {
  const c = Math.floor(C * 1e4) / 1e4;
  const hue = c === 0 ? 0 : round(((h % 360) + 360) % 360, 2);
  return `oklch(${round(L, 4)} ${c} ${hue})`;
}

const OKLCH = /^oklch\((\d*\.?\d+) (\d*\.?\d+) (\d*\.?\d+)\)$/;

export function parseOklch(s: string): Oklch | null {
  const m = OKLCH.exec(s);
  return m ? { L: +m[1], C: +m[2], h: +m[3] } : null;
}

/** A colour fitted to each gamut. */
export function swatch(c: Oklch): Swatch {
  return { srgb: formatOklch(toGamut(c, 'srgb')), p3: formatOklch(toGamut(c, 'p3')) };
}

export const DEFAULT_PALETTE: Palette = {
  light: swatch({ L: 1, C: 0, h: 0 }),
  dark: swatch({ L: 0, C: 0, h: 0 }),
};

/** HSL (s, l in 0..1, hue in degrees) → OKLCH. Always inside sRGB. */
export function hslToOklch(h: number, s: number, l: number): Oklch {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return linearSrgbToOklch([f(0), f(8), f(4)].map(gammaDecode) as Rgb);
}

/** The sRGB rendering of an `oklch()` string, as 0..255 channels. */
export function toRgb255(s: string): Rgb | null {
  const c = parseOklch(s);
  if (!c) return null;
  return oklchToLinearSrgb(c).map((v) => Math.round(clamp01(gammaEncode(v)) * 255)) as Rgb;
}

/** WCAG 2 contrast ratio between two `oklch()` colours (1 … 21), in sRGB. */
export function contrastRatio(a: string, b: string): number {
  const lum = (s: string) => {
    const c = parseOklch(s);
    if (!c) return NaN;
    const [r, g, bl] = oklchToLinearSrgb(c).map(clamp01);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

// ── Axis → colour ────────────────────────────────────────────────────

/**
 * One axis position, split into how far along the black/white → colour ramp it
 * is (`t`, 0..1) and which hue it has reached (degrees past the start hue).
 */
export function axis(v: number): { t: number; turn: number } {
  const p = clamp01(v);
  return {
    t: clamp01((p - DEADZONE) / (RAMP_END - DEADZONE)),
    turn: 360 * clamp01((p - RAMP_END) / (1 - RAMP_END)),
  };
}

/** The colour an end of the palette lands on once the ramp is complete. */
interface Target {
  L: number; // lightness, 0..1 (OKLCH L, or HSL l)
  C: number; // OKLCH chroma, or HSL saturation 0..1
  h: number; // start hue, degrees
}

type Space = 'oklch' | 'hsl';

const EXTREME = { light: 1, dark: 0 } as const;

/** Mix from pure white/black (t = 0) to `target` at hue `hue` (t = 1). */
function rampColour(space: Space, end: 'light' | 'dark', target: Target, t: number, hue: number): Swatch {
  const L = EXTREME[end] + (target.L - EXTREME[end]) * t;
  const C = target.C * t;
  return swatch(space === 'oklch' ? { L, C, h: hue } : hslToOklch(hue, C, L));
}

// ── Systems ──────────────────────────────────────────────────────────

export interface PaletteSystem {
  id: string;
  label: string;
  describe: string;
  pick: (p: Point) => Palette;
}

/**
 * Reshapes the dark end's hue sweep. Dark greens can hold very little chroma
 * (green carries most of the luminance, so a green at L 0.3 is barely
 * coloured), and green spans only ~30° of an even hue sweep, so it shows up as
 * a thin, murky band. Shaping lifts one band's lightness, where there is more
 * chroma to be had, and re-divides the screen between hues: a band with
 * positive `stretch` gets more screen per degree, a negative one gets less.
 * The space has to come from somewhere, so compressing the dull stretches
 * (khaki, slate) is what lets green grow without squashing the vivid purples.
 */
export interface HueBand {
  centre: number; // degrees
  halfWidth: number; // degrees either side where the effect eases to nothing
  stretch: number; // extra screen per degree at the centre; negative compresses
}

export interface HueShaping {
  lift?: { centre: number; halfWidth: number; amount: number }; // added to target L
  bands: HueBand[];
}

/** A raised-cosine bump: 1 at `centre`, easing to 0 at ±`halfWidth` degrees. */
export function hueBump(h: number, centre: number, halfWidth: number): number {
  const d = Math.abs((((h - centre) % 360) + 540) % 360 - 180);
  return d >= halfWidth ? 0 : 0.5 * (1 + Math.cos((Math.PI * d) / halfWidth));
}

/** Screen per degree at hue `h`; never below a floor, so no hue vanishes. */
function hueWeight(h: number, bands: HueBand[]): number {
  let w = 1;
  for (const b of bands) w += b.stretch * hueBump(h, b.centre, b.halfWidth);
  return Math.max(0.15, w);
}

const WARP_STEPS = 720;
const warpTables = new Map<string, Float64Array>();

/**
 * Sweep fraction `u` (0..1) → hue, starting at `h0` and going once round the
 * circle, spending hueWeight(h) screen per degree. The inverse of the
 * cumulative weight, via a cached table.
 */
export function warpedHue(h0: number, u: number, bands: HueBand[]): number {
  const key = `${h0}|${JSON.stringify(bands)}`;
  let cdf = warpTables.get(key);
  if (!cdf) {
    cdf = new Float64Array(WARP_STEPS + 1);
    for (let i = 1; i <= WARP_STEPS; i++) {
      cdf[i] = cdf[i - 1] + hueWeight(h0 + (360 * (i - 0.5)) / WARP_STEPS, bands);
    }
    for (let i = 1; i <= WARP_STEPS; i++) cdf[i] /= cdf[WARP_STEPS];
    warpTables.set(key, cdf);
  }
  const target = clamp01(u);
  let lo = 0;
  let hi = WARP_STEPS;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cdf[mid] < target) lo = mid;
    else hi = mid;
  }
  const span = cdf[hi] - cdf[lo];
  const frac = span > 0 ? (target - cdf[lo]) / span : 0;
  return h0 + (360 * (lo + frac)) / WARP_STEPS;
}

/**
 * x drives the light colour, y the dark one, each with its own ramp + hue.
 * `darkShaping` optionally reshapes the dark sweep (see HueShaping).
 */
function independent(space: Space, light: Target, dark: Target, darkShaping?: HueShaping) {
  return ({ x, y }: Point): Palette => {
    const ax = axis(x);
    const ay = axis(y);
    let darkHue = dark.h + ay.turn;
    let darkTarget = dark;
    if (darkShaping) {
      darkHue = warpedHue(dark.h, ay.turn / 360, darkShaping.bands);
      const lift = darkShaping.lift;
      if (lift) darkTarget = { ...dark, L: dark.L + lift.amount * hueBump(darkHue, lift.centre, lift.halfWidth) };
    }
    return {
      light: rampColour(space, 'light', light, ax.t, light.h + ax.turn),
      dark: rampColour(space, 'dark', darkTarget, ay.t, darkHue),
    };
  };
}

/**
 * x drives one shared hue and the ramp for both colours; y is the angle
 * between them (0 = the same hue, ½ = complementary).
 */
function linked(space: Space, light: Target, dark: Target) {
  return ({ x, y }: Point): Palette => {
    const ax = axis(x);
    const hue = light.h + ax.turn;
    return {
      light: rampColour(space, 'light', light, ax.t, hue),
      dark: rampColour(space, 'dark', dark, ax.t, hue + 360 * clamp01(y)),
    };
  };
}

const SOFT_LIGHT: Target = { L: 0.95, C: 0.04, h: 90 };
const SOFT_DARK: Target = { L: 0.3, C: 0.2, h: 265 };
const GREEN_SHAPING: HueShaping = {
  lift: { centre: 150, halfWidth: 75, amount: 0.08 },
  bands: [
    { centre: 150, halfWidth: 45, stretch: 1.5 }, // green: more
    { centre: 80, halfWidth: 35, stretch: -0.6 }, // khaki/olive: less
    { centre: 215, halfWidth: 40, stretch: -0.6 }, // slate teal: less
  ],
};
const VIVID_LIGHT: Target = { L: 0.88, C: 0.12, h: 90 };
const VIVID_DARK: Target = { L: 0.3, C: 0.14, h: 265 };

export const PALETTE_SYSTEMS: PaletteSystem[] = [
  {
    id: 'oklch-greens',
    label: 'OKLCH greens · x light, y dark',
    describe: 'As OKLCH, but the dark greens are lifted in lightness and given more of the sweep.',
    pick: independent('oklch', SOFT_LIGHT, SOFT_DARK, GREEN_SHAPING),
  },
  {
    id: 'oklch',
    label: 'OKLCH · x light, y dark',
    describe: 'Perceptual: every hue lands at the same apparent lightness.',
    pick: independent('oklch', SOFT_LIGHT, SOFT_DARK),
  },
  {
    id: 'oklch-vivid',
    label: 'OKLCH vivid · x light, y dark',
    describe: 'Same axes, higher chroma and less extreme lightness.',
    pick: independent('oklch', VIVID_LIGHT, VIVID_DARK),
  },
  {
    id: 'oklch-linked',
    label: 'OKLCH linked · x hue, y hue gap',
    describe: 'x picks one hue for both; y turns the dark one away from it.',
    pick: linked('oklch', SOFT_LIGHT, SOFT_DARK),
  },
  {
    id: 'hsl',
    label: 'HSL · x light, y dark',
    describe: 'Naive HSL for comparison: yellows glare, blues sink.',
    pick: independent('hsl', { L: 0.92, C: 0.7, h: 50 }, { L: 0.13, C: 0.6, h: 230 }),
  },
];

export const DEFAULT_SYSTEM_ID = PALETTE_SYSTEMS[0].id;

export function findSystem(id: string | null | undefined): PaletteSystem {
  return PALETTE_SYSTEMS.find((s) => s.id === id) ?? PALETTE_SYSTEMS[0];
}

/** A point within the deadzone on both axes is the default palette. */
export function isDefault(p: Palette): boolean {
  return p.light.srgb === DEFAULT_PALETTE.light.srgb && p.dark.srgb === DEFAULT_PALETTE.dark.srgb;
}

// ── Storage ──────────────────────────────────────────────────────────

export const PALETTE_STORAGE_KEY = 'palette';

const parseSwatch = (v: unknown): Swatch | null => {
  const o = v as Partial<Swatch> | null;
  return o && typeof o.srgb === 'string' && typeof o.p3 === 'string' && parseOklch(o.srgb) && parseOklch(o.p3)
    ? { srgb: o.srgb, p3: o.p3 }
    : null;
};

/** Parse the stored palette; anything missing or malformed is "no palette". */
export function parsePalette(raw: string | null): Palette | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    const light = parseSwatch(p?.light);
    const dark = parseSwatch(p?.dark);
    return light && dark ? { light, dark } : null;
  } catch {
    return null;
  }
}
