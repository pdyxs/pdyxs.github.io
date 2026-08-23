import { describe, it, expect } from 'vitest';
import {
  scrollBehaviourFor,
  scrollSettleAction,
  transitionWillFire,
  SCROLL_SETTLE_MIN_FRAMES,
  SCROLL_SETTLE_TIMEOUT_MS,
} from './stack-motion';

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

describe('scrollSettleAction', () => {
  /** A settled desktop-shaped reading: nothing animating, offset unchanged. */
  const at = (over: Partial<Parameters<typeof scrollSettleAction>[0]> = {}) =>
    scrollSettleAction({
      previousOffset: 120,
      currentOffset: 120,
      animating: false,
      framesSeen: SCROLL_SETTLE_MIN_FRAMES,
      elapsedMs: 64,
      ...over,
    });

  it('waits while a body collapse is running', () => {
    // The mobile case: the card travels up the page for the whole 300ms.
    expect(at({ animating: true, previousOffset: 9000, currentOffset: 6000 })).toBe('wait');
    // ...and keeps waiting even when two frames happen to read alike.
    expect(at({ animating: true })).toBe('wait');
  });

  it('waits out the frames BEFORE the transition exists', () => {
    // The trap. Measured on the real page: the card mounts, the next two frames
    // read an identical offset, and only then does the collapse begin. Stability
    // alone reports "settled" at the one moment everything is about to move.
    expect(at({ framesSeen: 1 })).toBe('wait');
    expect(at({ framesSeen: 2 })).toBe('wait');
    expect(at({ framesSeen: SCROLL_SETTLE_MIN_FRAMES })).toBe('aim');
  });

  it('aims once nothing is animating and the offset has come to rest', () => {
    expect(at()).toBe('aim');
  });

  it('waits while the offset is still moving with no transition to explain it', () => {
    // A fragment landing above the active card, or a late image: no transition
    // is involved, so `animating` cannot see it.
    expect(at({ previousOffset: 900, currentOffset: 81 })).toBe('wait');
  });

  it('never aims on its first measurement, having nothing to compare against', () => {
    expect(at({ previousOffset: null, framesSeen: 99 })).toBe('wait');
  });

  it('aims at the deadline rather than waiting on a layout that never rests', () => {
    // A slow image above the fold would otherwise leave the scroll unaimed.
    expect(at({ animating: true, elapsedMs: SCROLL_SETTLE_TIMEOUT_MS })).toBe('aim');
    expect(at({ previousOffset: null, framesSeen: 0, elapsedMs: SCROLL_SETTLE_TIMEOUT_MS + 1 })).toBe('aim');
  });

  it('treats a sub-pixel wobble as movement, because the comparison is exact', () => {
    // Deliberate: rounding here would let a layout creeping by fractions read
    // as settled. The deadline is what bounds the cost of being strict.
    expect(at({ previousOffset: 53.5, currentOffset: 53.4 })).toBe('wait');
  });
});
