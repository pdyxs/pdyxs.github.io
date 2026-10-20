import { describe, it, expect, beforeEach, vi } from 'vitest';

// The palette tool's state machine, with the effect layer mocked: what it
// applies, commits and reverts, and when.
const { STORED } = vi.hoisted(() => ({ STORED: { stored: true } }));
vi.mock('@site/palette-dom', () => ({
  applyPalette: vi.fn(),
  commitPalette: vi.fn(),
  pickAt: vi.fn((p: { x: number; y: number }) => ({ at: 'px', ...p })),
  pickPoint: vi.fn((p: { x: number; y: number }) => ({ at: 'frac', ...p })),
  pointFor: vi.fn(() => ({ x: 0.5, y: 0.5 })),
  storedPalette: vi.fn(() => STORED),
  toFraction: vi.fn((p: { x: number; y: number }) => ({ x: p.x / 1000, y: p.y / 1000 })),
}));

import * as dom from '@site/palette-dom';
import { createPaletteBehaviour, STEP, BIG_STEP } from './palette';
import { BUILT_IN } from './index';
import type { ToolBehaviour } from './types';

const apply = vi.mocked(dom.applyPalette);
const commit = vi.mocked(dom.commitPalette);

const key = (b: ToolBehaviour, k: string, opts: { shiftKey?: boolean; target?: EventTarget } = {}) => {
  const e = new KeyboardEvent('keydown', { key: k, shiftKey: opts.shiftKey ?? false });
  if (opts.target) Object.defineProperty(e, 'currentTarget', { value: opts.target });
  return b.key!(e);
};

let b: ToolBehaviour;
beforeEach(() => {
  vi.clearAllMocks();
  b = createPaletteBehaviour();
});

describe('the palette tool', () => {
  it('is the registered drag behaviour', () => {
    expect(BUILT_IN.palette.kind).toBe('drag');
    expect(b.kind).toBe('drag');
  });

  describe('dragging', () => {
    it('picks live under the pointer, and commits where it is let go', () => {
      b.dragStart!({ x: 10, y: 10 });
      expect(dom.storedPalette).toHaveBeenCalledTimes(1);
      b.dragMove!({ x: 100, y: 200 });
      expect(apply).toHaveBeenLastCalledWith({ at: 'px', x: 100, y: 200 });
      b.dragEnd!({ x: 300, y: 400 }, false);
      expect(commit).toHaveBeenCalledWith({ at: 'px', x: 300, y: 400 }, { x: 0.3, y: 0.4 });
    });

    it('cancelled, it puts back the palette stored when it started, and commits nothing', () => {
      b.dragStart!({ x: 10, y: 10 });
      b.dragMove!({ x: 100, y: 200 });
      b.dragEnd!({ x: 100, y: 200 }, true);
      expect(apply).toHaveBeenLastCalledWith(STORED);
      expect(commit).not.toHaveBeenCalled();
    });

    it('a move or end with no drag started does nothing', () => {
      b.dragMove!({ x: 1, y: 1 });
      b.dragEnd!({ x: 1, y: 1 }, false);
      expect(apply).not.toHaveBeenCalled();
      expect(commit).not.toHaveBeenCalled();
    });

    it('arrows mid-drag are swallowed, and Escape is left to the mark', () => {
      b.dragStart!({ x: 10, y: 10 });
      expect(key(b, 'ArrowRight')).toBe(true);
      expect(apply).not.toHaveBeenCalled();
      expect(key(b, 'Escape')).toBe(false);
    });
  });

  describe('the keyboard', () => {
    it('arrows move a virtual point from the current palette’s, applying as they go', () => {
      expect(key(b, 'ArrowRight')).toBe(true);
      expect(dom.pointFor).toHaveBeenCalledWith(STORED);
      expect(apply).toHaveBeenLastCalledWith({ at: 'frac', x: 0.5 + STEP, y: 0.5 });
      expect(key(b, 'ArrowDown')).toBe(true);
      expect(apply).toHaveBeenLastCalledWith({ at: 'frac', x: 0.5 + STEP, y: 0.5 + STEP });
      expect(key(b, 'ArrowLeft', { shiftKey: true })).toBe(true);
      const last = apply.mock.lastCall![0] as unknown as { x: number; y: number };
      expect(last.x).toBeCloseTo(0.5 + STEP - BIG_STEP);
      expect(key(b, 'ArrowUp')).toBe(true);
      expect((apply.mock.lastCall![0] as unknown as { y: number }).y).toBeCloseTo(0.5);
      expect(commit).not.toHaveBeenCalled();
    });

    it('the point stays in the viewport', () => {
      for (let i = 0; i < 20; i++) key(b, 'ArrowRight', { shiftKey: true });
      expect(apply).toHaveBeenLastCalledWith({ at: 'frac', x: 1, y: 0.5 });
    });

    it('Enter keeps the pick, and ends it', () => {
      key(b, 'ArrowRight');
      expect(key(b, 'Enter')).toBe(true);
      expect(commit).toHaveBeenCalledWith({ at: 'frac', x: 0.5 + STEP, y: 0.5 }, { x: 0.5 + STEP, y: 0.5 });
      // Over: Escape is the mark's again.
      expect(key(b, 'Escape')).toBe(false);
    });

    it('Escape mid-pick puts the palette back and is taken', () => {
      key(b, 'ArrowRight');
      key(b, 'ArrowRight');
      expect(key(b, 'Escape')).toBe(true);
      expect(apply).toHaveBeenLastCalledWith(STORED);
      expect(commit).not.toHaveBeenCalled();
    });

    it('Escape and Enter with no pick in progress are not taken', () => {
      expect(key(b, 'Escape')).toBe(false);
      expect(key(b, 'Enter')).toBe(false);
      expect(key(b, 'a')).toBe(false);
      expect(apply).not.toHaveBeenCalled();
      expect(commit).not.toHaveBeenCalled();
    });

    it('focus leaving mid-pick puts the palette back', () => {
      const el = document.createElement('div');
      key(b, 'ArrowRight', { target: el });
      el.dispatchEvent(new FocusEvent('focusout'));
      expect(apply).toHaveBeenLastCalledWith(STORED);
      expect(key(b, 'Escape')).toBe(false);
    });

    it('focus leaving after Enter changes nothing', () => {
      const el = document.createElement('div');
      key(b, 'ArrowRight', { target: el });
      key(b, 'Enter');
      apply.mockClear();
      el.dispatchEvent(new FocusEvent('focusout'));
      expect(apply).not.toHaveBeenCalled();
    });

    it('a pointer drag takes over a keyboard pick; cancelling it goes back to before the keyboard', () => {
      key(b, 'ArrowRight');
      b.dragStart!({ x: 10, y: 10 });
      b.dragEnd!({ x: 10, y: 10 }, true);
      expect(apply).toHaveBeenLastCalledWith(STORED);
      expect(dom.storedPalette).toHaveBeenCalledTimes(1);
    });
  });
});
