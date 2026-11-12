import { describe, it, expect, beforeEach, vi } from 'vitest';

// The revert tool, with the effect layer mocked: when it hangs, what it
// listens to, and what pressing it keeps.
const { state } = vi.hoisted(() => ({
  state: { stored: null as unknown, listeners: new Set<(c: unknown) => void>() },
}));
vi.mock('@site/palette-dom', () => ({
  storedPalette: vi.fn(() => state.stored),
  commitPalette: vi.fn(),
  onPaletteChange: vi.fn((fn: (c: unknown) => void) => {
    state.listeners.add(fn);
    return () => state.listeners.delete(fn);
  }),
}));

import * as dom from '@site/palette-dom';
import { DEFAULT_PALETTE, type Palette } from '@site/palette';
import { paletteRevert } from './palette-revert';
import { BUILT_IN } from './index';

const SET: Palette = {
  light: { srgb: 'oklch(0.9 0.05 80)', p3: 'oklch(0.9 0.06 80)' },
  dark: { srgb: 'oklch(0.2 0.05 260)', p3: 'oklch(0.2 0.06 260)' },
};

beforeEach(() => {
  vi.clearAllMocks();
  state.stored = null;
  state.listeners.clear();
});

describe('the revert tool', () => {
  it('is the registered press behaviour', () => {
    expect(BUILT_IN['palette-revert']).toBe(paletteRevert);
    expect(paletteRevert.kind).toBe('press');
  });

  describe('shown()', () => {
    it('is false with no palette stored', () => {
      state.stored = null;
      expect(paletteRevert.shown!()).toBe(false);
    });

    it('is false when the stored palette is the default', () => {
      state.stored = DEFAULT_PALETTE;
      expect(paletteRevert.shown!()).toBe(false);
    });

    it('is true while a non-default palette is stored', () => {
      state.stored = SET;
      expect(paletteRevert.shown!()).toBe(true);
    });
  });

  it('subscribes to palette changes, and unsubscribes', () => {
    const changed = vi.fn();
    const off = paletteRevert.subscribe!(changed);
    expect(dom.onPaletteChange).toHaveBeenCalledTimes(1);
    for (const fn of state.listeners) fn({ palette: SET, point: null });
    expect(changed).toHaveBeenCalledTimes(1);
    off();
    expect(state.listeners.size).toBe(0);
    for (const fn of state.listeners) fn({ palette: null, point: null });
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('press keeps the default', () => {
    state.stored = SET;
    paletteRevert.press!();
    expect(dom.commitPalette).toHaveBeenCalledWith(null);
  });
});
