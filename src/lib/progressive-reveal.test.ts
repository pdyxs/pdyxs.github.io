import { describe, it, expect } from 'vitest';
import {
  DEFAULT_REVEAL_STEP,
  revealedAfter,
  revealButtonLabel,
  revealSettings,
  revealStatus,
} from './progressive-reveal';

describe('revealSettings', () => {
  it('defaults to the standard step for a lens that declares nothing', () => {
    expect(revealSettings(undefined)).toEqual({
      initial: DEFAULT_REVEAL_STEP,
      step: DEFAULT_REVEAL_STEP,
    });
    expect(revealSettings({ sortKey: 'ranking' })).toEqual({
      initial: DEFAULT_REVEAL_STEP,
      step: DEFAULT_REVEAL_STEP,
    });
  });

  it('takes a declared number as both the initial slice and the step', () => {
    expect(revealSettings({ reveal: 10 })).toEqual({ initial: 10, step: 10 });
  });

  it('opts out on `reveal: false`', () => {
    expect(revealSettings({ reveal: false })).toBeNull();
  });

  it('ignores a nonsense declaration rather than hiding everything', () => {
    // A zero or negative step would reveal nothing and never advance, which is
    // strictly worse than the default.
    expect(revealSettings({ reveal: 0 })?.initial).toBe(DEFAULT_REVEAL_STEP);
    expect(revealSettings({ reveal: -5 })?.initial).toBe(DEFAULT_REVEAL_STEP);
    expect(revealSettings({ reveal: 'lots' })?.initial).toBe(DEFAULT_REVEAL_STEP);
  });
});

describe('revealedAfter', () => {
  const settings = { initial: 24, step: 24 };

  it('is the initial slice at step zero — the server render', () => {
    expect(revealedAfter(settings, 0, 264)).toBe(24);
  });

  it('advances one step at a time', () => {
    expect(revealedAfter(settings, 1, 264)).toBe(48);
    expect(revealedAfter(settings, 3, 264)).toBe(96);
  });

  it('never overshoots the set', () => {
    expect(revealedAfter(settings, 100, 264)).toBe(264);
    expect(revealedAfter(settings, 1, 10)).toBe(10);
  });

  it('always moves, so a zero step can never deadlock the sentinel', () => {
    expect(revealedAfter({ initial: 24, step: 0 }, 1, 264)).toBe(25);
  });
});

describe('revealStatus', () => {
  it('reports the rendered slice and what is held back', () => {
    expect(revealStatus(264, 24)).toEqual({ shown: 24, remaining: 240, more: true });
  });

  it('clamps a reveal position past the end of a shrunken set', () => {
    // Narrowing the filters can leave `revealed` above the new total before
    // the reset lands; the status must still describe the real set.
    expect(revealStatus(6, 48)).toEqual({ shown: 6, remaining: 0, more: false });
  });

  it('has nothing more to reveal when the set fits in the first slice', () => {
    expect(revealStatus(10, 24).more).toBe(false);
  });

  it('handles an empty set', () => {
    expect(revealStatus(0, 24)).toEqual({ shown: 0, remaining: 0, more: false });
  });
});

describe('revealButtonLabel', () => {
  it('promises one step, not the whole remainder', () => {
    expect(revealButtonLabel(240, 24)).toBe('Show 24 more');
  });

  it('promises only what is left on the final step', () => {
    expect(revealButtonLabel(6, 24)).toBe('Show 6 more');
  });
});
