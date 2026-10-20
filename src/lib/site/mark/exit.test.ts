import { describe, it, expect } from 'vitest';
import { caughtDot, exitTime, slotSource, type SlotSourceInput } from '@site/mark/exit';
import { DOT_AT_REST, HANG_Y, stepDot } from '@site/mark/motion';

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
  const base: SlotSourceInput = { mode: 'page', run: null, runStart: false, slot: true };

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
    expect(slotSource({ ...base, run: 'vt', direction: 'return', runStart: true })).toBe('tracked');
    // No slot laid out to follow: the trajectory alone.
    expect(slotSource({ ...base, run: 'vt', direction: 'return', runStart: true, slot: false })).toBe('exit');
  });

  it('keeps hanging until a return has measured the title it is coming back to', () => {
    // Even after a cold card load, which never had a title to measure.
    expect(slotSource({ ...base, run: 'vt', slot: false })).toBe('hang');
    expect(slotSource({ ...base, run: 'vt', slot: true })).toBe('hang');
  });

  it('reads the live, animated title on a return with no view transition', () => {
    expect(slotSource({ ...base, run: 'live' })).toBe('live');
  });

  it("hangs from the hang's own slot in card mode, with or without a title ever measured", () => {
    expect(slotSource({ ...base, mode: 'card', slot: false })).toBe('hang');
  });
});

describe('caughtDot', () => {
  it('starts an undrawn dot (a cold load) hanging at the edge', () => {
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
