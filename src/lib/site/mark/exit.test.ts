import { describe, it, expect } from 'vitest';
import { caughtDot, exitTime, hangFrame, slotSource, type SlotSourceInput } from '@site/mark/exit';
import {
  DOT_AT_REST,
  HANG_Y,
  TITLE_EXIT_MS,
  TITLE_EXIT_SCALE,
  hangSeparation,
  poseBlend,
  stepDot,
  titleExit,
  type TitleStart,
} from '@site/mark/motion';

const start: TitleStart = { slot: { x: 300, y: 70 }, titleOrigin: { x: 40, y: 40 }, headerHeight: 140 };
const viewport = { width: 1280, height: 800 };

describe('hangFrame', () => {
  it("is titleExit's last frame, so the hang carries on from where the exit ends", () => {
    expect(hangFrame(start, viewport)).toEqual(titleExit(start, viewport, TITLE_EXIT_MS));
  });

  it('puts the slot on the centre line, above the top edge, at the full hanging scale', () => {
    const f = hangFrame(start, viewport);
    expect(f.title.slot).toEqual({ x: 640, y: 70 - 140 });
    expect(f.title.scale).toBe(TITLE_EXIT_SCALE);
    expect(f.title.slot.y).toBeLessThan(HANG_Y);
  });

  it('follows the viewport width, and nothing else', () => {
    expect(hangFrame(start, { width: 390, height: 844 }).title.slot).toEqual({ x: 195, y: -70 });
  });

  it('grows to the scale it is given', () => {
    expect(hangFrame(start, viewport, { scale: 2 }).title.scale).toBe(2);
  });

  it('is the fully hanging pose', () => {
    const f = hangFrame(start, viewport);
    expect(poseBlend(true, f.title.slot.y, hangSeparation(start.headerHeight, start.slot.y))).toBe(1);
  });

  it('catches a dot that arrives at it', () => {
    const f = hangFrame(start, viewport);
    const d = stepDot(DOT_AT_REST, { slotY: f.title.slot.y, slotVy: 0, mode: 'card', size: 15, taut: 0, dt: 1 / 60, reduced: true });
    expect(d).toEqual({ stopped: true, y: { x: HANG_Y, v: 0 } });
  });
});

describe('exitTime', () => {
  it('reads an animation clock in ms', () => {
    expect(exitTime(210)).toBe(210);
  });

  it('is 0 before there is a clock, or for one that is not a plain number', () => {
    expect(exitTime(null)).toBe(0);
    expect(exitTime(undefined)).toBe(0);
    expect(exitTime(NaN)).toBe(0);
    expect(exitTime({ value: 3, unit: 'percent' })).toBe(0);
  });
});

describe('slotSource', () => {
  const base: SlotSourceInput = { mode: 'page', run: null, runStart: false, hang: false, slot: true };

  it('reads the live title at rest in page mode', () => {
    expect(slotSource(base)).toBe('live');
    expect(slotSource({ ...base, slot: false })).toBe('none');
  });

  it('samples the trajectory while a view transition carries the title', () => {
    expect(slotSource({ ...base, mode: 'card', run: 'vt', direction: 'leave', runStart: true, slot: false })).toBe('exit');
    // Leaving, the snapshot is the old state's, captured once: never the live slot.
    expect(slotSource({ ...base, mode: 'card', run: 'vt', direction: 'leave', runStart: true, slot: true })).toBe('exit');
  });

  it('follows the live slot on a return, whose snapshot the browser keeps placing on the new element', () => {
    expect(slotSource({ ...base, run: 'vt', direction: 'return', runStart: true, hang: true })).toBe('tracked');
    // No slot laid out to follow: the trajectory alone.
    expect(slotSource({ ...base, run: 'vt', direction: 'return', runStart: true, slot: false })).toBe('exit');
  });

  it('keeps hanging until a return has measured the title it is coming back to', () => {
    expect(slotSource({ ...base, run: 'vt', hang: true, slot: false })).toBe('hang');
    expect(slotSource({ ...base, run: 'vt', hang: false, slot: false })).toBe('none');
  });

  it('reads the live, animated title on a return with no view transition', () => {
    expect(slotSource({ ...base, run: 'live', hang: true })).toBe('live');
  });

  it('hangs from the virtual slot in card mode, and draws nothing with no title ever measured', () => {
    expect(slotSource({ ...base, mode: 'card', hang: true, slot: false })).toBe('hang');
    expect(slotSource({ ...base, mode: 'card', hang: false, slot: false })).toBe('none');
  });
});

describe('caughtDot', () => {
  it('starts an undrawn dot hanging at the edge', () => {
    expect(caughtDot(DOT_AT_REST)).toEqual({ stopped: true, y: { x: HANG_Y, v: 0 } });
  });

  it('leaves a hanging dot mid-settle alone', () => {
    const d = { stopped: true, y: { x: 4, v: 30 } };
    expect(caughtDot(d)).toBe(d);
  });

  it('lets go once the returning title passes back below the edge', () => {
    const d = stepDot(caughtDot(DOT_AT_REST), { slotY: 12, slotVy: 0, mode: 'page', size: 5, taut: 0, dt: 1 / 60, reduced: false });
    expect(d).toEqual({ stopped: false, y: { x: 12, v: 0 } });
  });
});
