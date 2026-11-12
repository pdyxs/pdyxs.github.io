import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  applyPalette,
  commitPalette,
  faviconSvg,
  onPaletteChange,
  pickPoint,
  pointFor,
  renderFavicon,
  storedPalette,
} from '@site/palette-dom';
import { DEFAULT_PALETTE, PALETTE_STORAGE_KEY, PALETTE_SYSTEMS, type Palette } from '@site/palette';

const PROPS = ['--color-light-srgb', '--color-light-p3', '--color-dark-srgb', '--color-dark-p3'];
const FAVICON = readFileSync(path.resolve(import.meta.dirname, '../../../public/favicon.svg'), 'utf8');

const picked = (): Palette => PALETTE_SYSTEMS[0].pick({ x: 0.5, y: 0.5 });
const style = () => document.documentElement.style;

beforeEach(() => {
  localStorage.clear();
  applyPalette(null);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(FAVICON)));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('applyPalette', () => {
  it('sets the four colour props on <html>, and removes them for the default', () => {
    const p = picked();
    applyPalette(p);
    expect(style().getPropertyValue('--color-light-srgb')).toBe(p.light.srgb);
    expect(style().getPropertyValue('--color-light-p3')).toBe(p.light.p3);
    expect(style().getPropertyValue('--color-dark-srgb')).toBe(p.dark.srgb);
    expect(style().getPropertyValue('--color-dark-p3')).toBe(p.dark.p3);
    applyPalette(null);
    for (const prop of PROPS) expect(style().getPropertyValue(prop)).toBe('');
  });

  it('stores nothing', () => {
    applyPalette(picked());
    expect(localStorage.getItem(PALETTE_STORAGE_KEY)).toBeNull();
  });
});

describe('commitPalette', () => {
  it('stores and applies a palette', () => {
    const p = picked();
    expect(commitPalette(p)).toEqual(p);
    expect(storedPalette()).toEqual(p);
    expect(style().getPropertyValue('--color-dark-srgb')).toBe(p.dark.srgb);
  });

  it('a default palette removes the storage key and the props', () => {
    commitPalette(picked());
    expect(commitPalette(DEFAULT_PALETTE)).toBeNull();
    expect(localStorage.getItem(PALETTE_STORAGE_KEY)).toBeNull();
    for (const prop of PROPS) expect(style().getPropertyValue(prop)).toBe('');
    commitPalette(picked());
    commitPalette(null);
    expect(localStorage.getItem(PALETTE_STORAGE_KEY)).toBeNull();
  });

  it('fires the change signal with what was kept and where it was picked', () => {
    const heard = vi.fn();
    const off = onPaletteChange(heard);
    const p = picked();
    commitPalette(p, { x: 0.5, y: 0.5 });
    expect(heard).toHaveBeenLastCalledWith({ palette: p, point: { x: 0.5, y: 0.5 } });
    commitPalette(DEFAULT_PALETTE);
    expect(heard).toHaveBeenLastCalledWith({ palette: null, point: null });
    off();
    commitPalette(p);
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it('a preview fires nothing', () => {
    const heard = vi.fn();
    const off = onPaletteChange(heard);
    applyPalette(picked());
    expect(heard).not.toHaveBeenCalled();
    off();
  });
});

describe('picking', () => {
  it('pointFor inverts pickPoint in the current system; the default is the corner', () => {
    const at = pointFor(pickPoint({ x: 0.4, y: 0.7 }));
    expect(Math.abs(at.x - 0.4)).toBeLessThan(0.01);
    expect(Math.abs(at.y - 0.7)).toBeLessThan(0.01);
    expect(pointFor(null)).toEqual({ x: 0, y: 0 });
  });
});

describe('the favicon', () => {
  it('overrides the file’s paper and ink by id', () => {
    const svg = faviconSvg('<svg><rect id="paper"/></svg>', 'oklch(0.3 0.1 265)', 'oklch(0.95 0.04 90)');
    expect(svg).toBe(
      '<svg><rect id="paper"/>' +
        '<style>#paper{fill:oklch(0.95 0.04 90)!important}#dot{fill:oklch(0.3 0.1 265)!important}' +
        '#threads path,#frame{stroke:oklch(0.3 0.1 265)!important}</style></svg>',
    );
  });

  it('public/favicon.svg still has the ids the override names', () => {
    for (const id of ['paper', 'threads', 'dot', 'frame']) expect(FAVICON).toContain(`id="${id}"`);
    expect(FAVICON.trimEnd().endsWith('</svg>')).toBe(true);
  });

  it('renderFavicon points link[rel=icon] at the recoloured file', async () => {
    const src = await renderFavicon();
    expect(src).toMatch(/^data:image\/svg\+xml,/);
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')!;
    expect(link.getAttribute('href')).toBe(src);
    expect(decodeURIComponent(src!)).toContain('#paper{fill:');
  });
});
