// Which palette the site's theme asks for, and the crossfade toward it. Pure.
import type { Theme } from '../types';
import type { ChargePalette, Rgb, ThemedPalette } from './palette';

export function paletteFor(themed: ThemedPalette, theme: Theme): ChargePalette {
  return theme === 'dark' ? themed.dark : themed.light;
}

const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function mixPalette(a: ChargePalette, b: ChargePalette, t: number): ChargePalette {
  return { neutral: mixRgb(a.neutral, b.neutral, t), pos: mixRgb(a.pos, b.pos, t), neg: mixRgb(a.neg, b.neg, t) };
}

/** A crossfade between two palettes: `t` runs 0 (all `from`) to 1 (all `to`). */
export interface PaletteFade {
  from: ChargePalette;
  to: ChargePalette;
  t: number;
}

export function shownPalette(f: PaletteFade): ChargePalette {
  const e = f.t * f.t * (3 - 2 * f.t);
  return e >= 1 ? f.to : mixPalette(f.from, f.to, e);
}

/**
 * Advance the fade by `dt` toward `target`. A new target restarts the fade from whatever
 * is on screen now, so a flip mid-fade never jumps.
 */
export function stepPaletteFade(f: PaletteFade, target: ChargePalette, dt: number, seconds: number): PaletteFade {
  if (target !== f.to) return { from: shownPalette(f), to: target, t: seconds > 0 ? Math.min(1, dt / seconds) : 1 };
  if (f.t >= 1) return f;
  return { ...f, t: seconds > 0 ? Math.min(1, f.t + dt / seconds) : 1 };
}
