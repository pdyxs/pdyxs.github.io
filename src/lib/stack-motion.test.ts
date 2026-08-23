import { describe, it, expect } from 'vitest';
import { scrollBehaviourFor, transitionWillFire } from './stack-motion';

describe('scrollBehaviourFor', () => {
  it('smooths a navigation', () => {
    expect(scrollBehaviourFor(false, false)).toBe('smooth');
  });

  it('is instant while the stack is being rebuilt', () => {
    // A cold load or a popstate splices entries in one fetch at a time, each
    // one moving the active card down — smoothing those is the page fighting
    // itself, and on first paint it races the browser's own restoration.
    expect(scrollBehaviourFor(true, false)).toBe('auto');
  });

  it('is instant under reduced motion, rebuild or not', () => {
    expect(scrollBehaviourFor(false, true)).toBe('auto');
    expect(scrollBehaviourFor(true, true)).toBe('auto');
  });
});

describe('transitionWillFire', () => {
  it('is true for a real duration', () => {
    expect(transitionWillFire('0.3s')).toBe(true);
    expect(transitionWillFire('300ms')).toBe(true);
  });

  it('is FALSE at zero — the whole point of the function', () => {
    // A zero-duration transition starts nothing and fires no `transitionend`,
    // so a caller that awaits one stalls for its entire fallback. This is what
    // the reduced-motion block makes reachable.
    expect(transitionWillFire('0s')).toBe(false);
    expect(transitionWillFire('0ms')).toBe(false);
  });

  it('reads a LIST, and one live entry is enough', () => {
    // `transition-duration` is per-property; getComputedStyle returns them all.
    expect(transitionWillFire('0s, 0.3s')).toBe(true);
    expect(transitionWillFire('0s, 0s')).toBe(false);
  });

  it('treats a missing or unreadable value as nothing will fire', () => {
    // Failing closed is the safe direction: the caller skips a wait it would
    // otherwise sit through, rather than stalling on an event that never comes.
    expect(transitionWillFire('')).toBe(false);
    expect(transitionWillFire(null)).toBe(false);
    expect(transitionWillFire(undefined)).toBe(false);
    expect(transitionWillFire('inherit')).toBe(false);
  });
});
