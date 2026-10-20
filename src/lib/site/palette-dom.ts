/**
 * The palette's effect layer: everything that applies, stores, announces or
 * draws a palette. The decisions (point → palette, and back) are pure, in
 * palette.ts; this is the thin applier every picker shares — the mark's
 * palette tool (mark-tools/palette.ts), the /experiments/palette-picker toys
 * and the suspended-dot bench.
 *
 * - `applyPalette` writes the four `--color-{light,dark}-{srgb,p3}` props on
 *   <html> (a live preview: nothing is stored or announced).
 * - `commitPalette` stores it (a default palette clears the key), applies it,
 *   recolours the favicon and fires the change signal.
 * - `onPaletteChange` is that signal: every commit, and another tab's.
 * - `watchPalette` (Base.astro calls it once per page) follows other tabs and
 *   theme changes, and draws the favicon for the loaded palette.
 *
 * Base.astro's head script applies the stored palette before first paint; it
 * is inline, so it repeats `applyPalette`'s four writes by hand.
 */
import {
  PALETTE_STORAGE_KEY,
  findSystem,
  isDefault,
  locate,
  parsePalette,
  type Palette,
  type PaletteSystem,
  type Point,
} from './palette';
import { THEME_CHANGE_EVENT } from './theme';

/** The system a pick uses (dev-only choice, /experiments/palette-picker's select). */
export const PALETTE_SYSTEM_KEY = 'palette-system';

/** A point in viewport (client) px. */
export interface ClientPoint {
  x: number;
  y: number;
}

export interface PaletteChange {
  /** What is now stored and applied; null is the default. */
  palette: Palette | null;
  /** The pick point (viewport fractions) it came from, when it came from one. */
  point: Point | null;
}

// ── Storage ──────────────────────────────────────────────────────────

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the palette just won't persist */
  }
}

/** The stored palette, or null for the default. */
export function storedPalette(): Palette | null {
  return parsePalette(read(PALETTE_STORAGE_KEY));
}

/** The system picks use: the stored choice, else the default. */
export function currentSystem(): PaletteSystem {
  return findSystem(read(PALETTE_SYSTEM_KEY));
}

export function storeSystem(id: string): void {
  write(PALETTE_SYSTEM_KEY, id);
}

// ── Picking ──────────────────────────────────────────────────────────

/** A viewport point as fractions of the viewport. */
export function toFraction(p: ClientPoint): Point {
  return { x: p.x / window.innerWidth, y: p.y / window.innerHeight };
}

/** The palette the current system picks at viewport fractions `p`. */
export function pickPoint(p: Point): Palette {
  return currentSystem().pick(p);
}

/** The palette the current system picks at a viewport point (px). */
export function pickAt(p: ClientPoint): Palette {
  return pickPoint(toFraction(p));
}

/** Where (viewport fractions) the current system picks `p`; the default is the top-left corner. */
export function pointFor(p: Palette | null): Point {
  return p ? locate(currentSystem(), p) : { x: 0, y: 0 };
}

// ── Applying ─────────────────────────────────────────────────────────

/** Write a palette (null = the default) onto <html>. A preview: nothing stored, nothing announced. */
export function applyPalette(p: Palette | null): void {
  const style = document.documentElement.style;
  for (const end of ['light', 'dark'] as const) {
    for (const gamut of ['srgb', 'p3'] as const) {
      const prop = `--color-${end}-${gamut}`;
      if (p) style.setProperty(prop, p[end][gamut]);
      else style.removeProperty(prop);
    }
  }
}

const listeners = new Set<(c: PaletteChange) => void>();

/** Hear every palette change that sticks: a commit here, or another tab's. Returns an unsubscribe. */
export function onPaletteChange(fn: (c: PaletteChange) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function announce(c: PaletteChange): void {
  for (const fn of [...listeners]) fn(c);
}

/**
 * Keep a palette: store it (a default one clears the key), apply it, recolour
 * the favicon and announce it. Returns what was kept (null = default).
 */
export function commitPalette(p: Palette | null, point: Point | null = null): Palette | null {
  const keep = p && !isDefault(p) ? p : null;
  write(PALETTE_STORAGE_KEY, keep ? JSON.stringify(keep) : null);
  applyPalette(keep);
  void renderFavicon();
  announce({ palette: keep, point });
  return keep;
}

// ── Favicon ──────────────────────────────────────────────────────────

/**
 * public/favicon.svg with its colours overridden: the paper (`#paper`) and
 * the ink (`#dot`, `#threads`' paths, `#frame`). Author `!important` beats the
 * file's inline styles. favicon.test.ts holds the file to those ids.
 */
export function faviconSvg(source: string, ink: string, paper: string): string {
  const override =
    `<style>#paper{fill:${paper}!important}#dot{fill:${ink}!important}` +
    `#threads path,#frame{stroke:${ink}!important}</style>`;
  return source.replace(/<\/svg>\s*$/, `${override}</svg>`);
}

let faviconSource: Promise<string> | undefined;

/**
 * Recolour `link[rel=icon]` to the page's ink and paper as they are now
 * (palette and theme both). Resolves to the data URI drawn, or null when the
 * file couldn't be fetched (the link is then left as it was).
 */
export async function renderFavicon(): Promise<string | null> {
  faviconSource ??= fetch('/favicon.svg').then((r) => {
    if (!r.ok) throw new Error(`favicon.svg: ${r.status}`);
    return r.text();
  });
  let source: string;
  try {
    source = await faviconSource;
  } catch {
    faviconSource = undefined;
    return null;
  }
  const cs = getComputedStyle(document.body);
  const src = `data:image/svg+xml,${encodeURIComponent(faviconSvg(source, cs.color, cs.backgroundColor))}`;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/svg+xml';
  link.href = src;
  return src;
}

// ── The page ─────────────────────────────────────────────────────────

let watching = false;

/**
 * Once per page (Base.astro): follow another tab's picks, recolour the
 * favicon on a theme change, and draw it now if the page isn't the file's
 * own black on white. Idempotent.
 */
export function watchPalette(): void {
  if (watching) return;
  watching = true;
  window.addEventListener('storage', (e) => {
    if (e.key !== PALETTE_STORAGE_KEY) return;
    const p = parsePalette(e.newValue);
    applyPalette(p);
    void renderFavicon();
    announce({ palette: p, point: null });
  });
  document.addEventListener(THEME_CHANGE_EVENT, () => void renderFavicon());
  if (storedPalette() || document.documentElement.dataset.theme === 'dark') void renderFavicon();
}
