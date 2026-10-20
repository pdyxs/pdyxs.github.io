// The palette tool: drag the bauble across the page and the point under it
// picks the two site colours, live; let go to keep them. The same pick as
// the floating PalettePicker, through the same effect layer (palette-dom.ts).
//
// Keyboard, on the focused bauble: an arrow moves a virtual pick point and
// applies the palette there (Shift: ten times the step). The point starts
// where the current palette is (pointFor), so the first press nudges rather
// than jumps. Enter keeps it, Escape puts the palette back as it was. Escape
// with no pick in progress isn't taken, so it still closes the tools. Focus
// leaving mid-pick puts it back too: an unkept pick never outlives the bauble.

import type { Palette, Point } from '@site/palette';
import {
  applyPalette,
  commitPalette,
  pickAt,
  pickPoint,
  pointFor,
  storedPalette,
  toFraction,
} from '@site/palette-dom';
import type { ToolBehaviour, ViewportPoint } from './types';

/** An arrow's step, as a fraction of the viewport (Shift: BIG_STEP). */
export const STEP = 0.01;
export const BIG_STEP = 0.1;

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** A palette tool. A factory so a test can have a fresh one; the registry holds one. */
export function createPaletteBehaviour(): ToolBehaviour {
  /** What to put back on cancel: the stored palette when the pick began. Set while picking. */
  let before: { palette: Palette | null } | null = null;
  /** The keyboard's virtual pick point (viewport fractions), while it is picking. */
  let kbd: Point | null = null;
  let stopWatchingFocus: (() => void) | null = null;

  const begin = () => {
    before ??= { palette: storedPalette() };
  };
  const finish = () => {
    before = null;
    kbd = null;
    stopWatchingFocus?.();
    stopWatchingFocus = null;
  };
  const revert = () => {
    if (before) applyPalette(before.palette);
    finish();
  };

  /** Mid keyboard pick, focus leaving the bauble puts the palette back. */
  const watchFocus = (el: EventTarget | null) => {
    if (stopWatchingFocus || !el) return;
    const lost = () => revert();
    el.addEventListener('focusout', lost, { once: true });
    stopWatchingFocus = () => el.removeEventListener('focusout', lost);
  };

  return {
    kind: 'drag',

    dragStart(_p: ViewportPoint) {
      // A pointer takes over a keyboard pick; the snapshot stays the original.
      kbd = null;
      stopWatchingFocus?.();
      stopWatchingFocus = null;
      begin();
    },

    dragMove(p: ViewportPoint) {
      if (!before) return;
      applyPalette(pickAt(p));
    },

    dragEnd(p: ViewportPoint, cancelled: boolean) {
      if (!before) return;
      if (cancelled) revert();
      else {
        commitPalette(pickAt(p), toFraction(p));
        finish();
      }
    },

    key(e: KeyboardEvent): boolean {
      const arrow = ARROWS[e.key];
      if (arrow) {
        if (before && !kbd) return true; // a pointer drag is in progress: the pointer has it
        if (!kbd) {
          begin();
          kbd = pointFor(before!.palette);
          watchFocus(e.currentTarget);
        }
        const step = e.shiftKey ? BIG_STEP : STEP;
        kbd = { x: clamp01(kbd.x + arrow[0] * step), y: clamp01(kbd.y + arrow[1] * step) };
        applyPalette(pickPoint(kbd));
        return true;
      }
      if (!kbd) return false;
      if (e.key === 'Enter') {
        const at = kbd;
        commitPalette(pickPoint(at), at);
        finish();
        return true;
      }
      if (e.key === 'Escape') {
        revert();
        return true;
      }
      return false;
    },
  };
}

export const palette: ToolBehaviour = createPaletteBehaviour();
