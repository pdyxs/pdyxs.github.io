import { describe, it, expect } from 'vitest';
import {
  computeGeometry,
  drawnCount,
  pileSections,
  aheadPitch,
  geometryFor,
  scrollTargetFor,
  MAX_PILE_LAYERS,
  STACK_GEOMETRY,
  type GeoParams,
} from './stack-geometry';
import { cardEntry, lensEntry, withFreeSlot, type StackState } from './stack-layout';

/** The settled parameters plus a width, which is the one runtime member. */
const params = (over: Partial<GeoParams> = {}): GeoParams => ({
  ...STACK_GEOMETRY,
  activeWidth: 680,
  ...over,
});

describe('drawnCount', () => {
  it('draws every card while they fit: 3 of 4 slots is no pile', () => {
    expect(drawnCount(3, 4)).toBe(3);
  });

  it('draws every card when they exactly fill the slots: 4 of 4 is no pile', () => {
    expect(drawnCount(4, 4)).toBe(4);
  });

  it('spends a slot on the pile once they do not fit: 5 in 4 is 3 drawn + 2 piled', () => {
    expect(drawnCount(5, 4)).toBe(3);
    expect(5 - drawnCount(5, 4)).toBe(2);
  });

  it('the pile absorbs arbitrary depth: 10 in 4 is 3 drawn + 7 piled', () => {
    expect(drawnCount(10, 4)).toBe(3);
    expect(10 - drawnCount(10, 4)).toBe(7);
  });

  it('one slot holding two cards is all pile: 2 in 1 is 0 drawn + 2 piled', () => {
    expect(drawnCount(2, 1)).toBe(0);
    expect(2 - drawnCount(2, 1)).toBe(2);
  });

  // The point of the pile-is-a-slot rule: a pile of exactly one would be a
  // marker occupying the very slot the card it hides could have used.
  it('a pile of exactly 1 is unrepresentable at every (total, slots)', () => {
    for (let slots = 1; slots <= 8; slots++) {
      for (let total = 0; total <= 40; total++) {
        const piled = total - drawnCount(total, slots);
        expect(piled).not.toBe(1);
        expect(piled).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('pileSections', () => {
  it('gives one band per card while they fit', () => {
    expect(pileSections([7, 6, 5], 5)).toEqual([
      { index: 7, count: 1 },
      { index: 6, count: 1 },
      { index: 5, count: 1 },
    ]);
  });

  it('the last band absorbs the remainder rather than being an extra', () => {
    const indices = Array.from({ length: 20 }, (_, i) => i);
    const sections = pileSections(indices, 5);
    expect(sections).toHaveLength(5);
    expect(sections.slice(0, 4)).toEqual([
      { index: 0, count: 1 },
      { index: 1, count: 1 },
      { index: 2, count: 1 },
      { index: 3, count: 1 },
    ]);
    expect(sections[4]).toEqual({ index: 4, count: 16 });
  });

  it('never emits a band standing for exactly one card it is not showing', () => {
    for (let max = 1; max <= 6; max++) {
      for (let n = 0; n <= 30; n++) {
        const sections = pileSections(Array.from({ length: n }, (_, i) => i), max);
        expect(sections.length).toBeLessThanOrEqual(Math.max(1, max));
        const total = sections.reduce((sum, s) => sum + s.count, 0);
        expect(total).toBe(n);
      }
    }
  });
});

describe('the dither ramp', () => {
  it('saturates at rank 3 at the settled values', () => {
    // ditherMid 5, step -2: 5 → 3 → 1 → 0 (clamped) and flat thereafter.
    const { cards } = computeGeometry(12, 11, params({ backwardStrip: 12 }));
    const byDepth = (d: number) => cards.find(c => c.depth === d && c.role === 'behind')!;
    expect(byDepth(1).dither).toBe(3);
    expect(byDepth(2).dither).toBe(1);
    expect(byDepth(3).dither).toBe(0);
    expect(byDepth(4).dither).toBe(0);
    expect(byDepth(11).dither).toBe(0);
  });

  it('the active card carries the anchor level, so nothing special-cases it', () => {
    const { cards } = computeGeometry(5, 2, params());
    expect(cards.find(c => c.role === 'active')!.dither).toBe(STACK_GEOMETRY.ditherMid);
  });

  it('clamps to 0 at the paper end with an extreme negative step', () => {
    const { cards } = computeGeometry(9, 4, params({ ditherStepBack: -99, ditherStepAhead: -99 }));
    for (const card of cards) {
      expect(card.dither).toBeGreaterThanOrEqual(0);
    }
    expect(cards.every(c => c.role === 'active' || c.dither === 0)).toBe(true);
  });

  it('clamps to 16 at the ink end with an extreme positive step', () => {
    const { cards } = computeGeometry(9, 4, params({ ditherStepBack: 99, ditherStepAhead: 99 }));
    for (const card of cards) {
      expect(card.dither).toBeLessThanOrEqual(16);
    }
    expect(cards.every(c => c.role === 'active' || c.dither === 16)).toBe(true);
  });
});

describe('aheadPitch', () => {
  it('is the sliver less the overlap at the settled values', () => {
    expect(aheadPitch(params())).toBe(36);
  });

  it('floors at 8 so the fan cannot invert when the overlap exceeds the sliver', () => {
    expect(aheadPitch(params({ forwardOverlap: 400 }))).toBe(8);
    expect(aheadPitch(params({ collapsedWidth: 4, forwardOverlap: 4 }))).toBe(8);
  });

  it('places the ahead fan monotonically left-to-right even when inverted', () => {
    const { cards } = computeGeometry(4, 0, params({ forwardOverlap: 400 }));
    // Drawn cards only: piled ones deliberately share one slot's `left`.
    const ahead = cards
      .filter(c => c.role === 'ahead' && !c.piled)
      .sort((x, y) => x.depth - y.depth);
    expect(ahead.length).toBeGreaterThan(1);
    for (let i = 1; i < ahead.length; i++) {
      expect(ahead[i].left).toBeGreaterThan(ahead[i - 1].left);
    }
  });
});

describe('computeGeometry placement', () => {
  // The property #98 was built around: a card omitted from the result is a DOM
  // node destroyed and rebuilt, so it mounts at its destination instead of
  // travelling there — and nothing animates. Invisible at rest, which is why
  // it is swept rather than spot-checked.
  it('places every card in the stack, at every depth and every active index', () => {
    for (let length = 1; length <= 12; length++) {
      for (let active = 0; active < length; active++) {
        const { cards } = computeGeometry(length, active, params());
        expect(cards).toHaveLength(length);
        const indices = cards.map(c => c.index).sort((x, y) => x - y);
        expect(indices).toEqual(Array.from({ length }, (_, i) => i));
      }
    }
  });

  it('paints in stack order, so z is the index', () => {
    const { cards } = computeGeometry(7, 3, params());
    expect(cards.map(c => c.z)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(cards.map(c => c.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('classifies roles by side of the active card', () => {
    const { cards } = computeGeometry(5, 2, params());
    expect(cards.map(c => c.role)).toEqual(['behind', 'behind', 'active', 'ahead', 'ahead']);
    expect(cards.map(c => c.depth)).toEqual([2, 1, 0, 1, 2]);
  });

  it('clamps an out-of-range active index rather than placing nothing', () => {
    expect(computeGeometry(4, 99, params()).cards.find(c => c.role === 'active')!.index).toBe(3);
    expect(computeGeometry(4, -5, params()).cards.find(c => c.role === 'active')!.index).toBe(0);
  });

  it('steps the behind fan left and up by a slot each', () => {
    const { cards } = computeGeometry(4, 3, params());
    const behind = cards.filter(c => c.role === 'behind').sort((x, y) => x.depth - y.depth);
    expect(behind.map(c => c.left)).toEqual([-40, -80, -120]);
    expect(behind.map(c => c.top)).toEqual([-8, -16, -24]);
  });

  it('measures the ahead fan off the active width', () => {
    const { cards } = computeGeometry(3, 0, params());
    const ahead = cards.filter(c => c.role === 'ahead').sort((x, y) => x.depth - y.depth);
    // activeWidth - forwardOverlap, then one pitch per further step.
    expect(ahead.map(c => c.left)).toEqual([676, 712]);
    expect(ahead.map(c => c.top)).toEqual([8, 16]);
  });

  it('leaves the staircase bottom edge alone, and flushes it when asked', () => {
    expect(computeGeometry(4, 3, params()).cards.every(c => c.extraHeight === 0)).toBe(true);
    const flush = computeGeometry(4, 3, params({ bottomEdge: 'flush' }));
    const behind = flush.cards.filter(c => c.role === 'behind').sort((x, y) => x.depth - y.depth);
    expect(behind.map(c => c.extraHeight)).toEqual([8, 16, 24]);
  });
});

describe('computeGeometry piles', () => {
  it('reports no pile while both fans fit', () => {
    expect(computeGeometry(7, 3, params()).piles).toEqual([]);
  });

  it('piles the behind overflow into the last slot, nearest card labelling it', () => {
    // 6 behind, backwardStrip 3 → 2 drawn, 4 piled in slot 3.
    const { cards, piles } = computeGeometry(7, 6, params());
    const behindPile = piles.find(p => p.side === 'behind')!;
    expect(behindPile.count).toBe(4);
    expect(behindPile.labelIndex).toBe(3);
    expect(behindPile.indices).toEqual([3, 2, 1, 0]);

    const piled = cards.filter(c => c.piled);
    expect(piled.map(c => c.index).sort((x, y) => x - y)).toEqual([0, 1, 2, 3]);
    expect(cards.filter(c => c.pileLabel).map(c => c.index)).toEqual([3]);
    // Every piled card shares the pile's slot horizontally...
    expect(new Set(piled.map(c => c.left)).size).toBe(1);
    // ...and stops fanning vertically past MAX_PILE_LAYERS.
    expect(new Set(piled.map(c => c.top)).size).toBe(MAX_PILE_LAYERS);
  });

  it('piles the ahead overflow, deepest card labelling it', () => {
    // 6 ahead, forwardFan 3 → 2 drawn, 4 piled.
    const { cards, piles } = computeGeometry(7, 0, params());
    const aheadPile = piles.find(p => p.side === 'ahead')!;
    expect(aheadPile.count).toBe(4);
    expect(aheadPile.labelIndex).toBe(6);
    expect(aheadPile.indices).toEqual([3, 4, 5, 6]);
    expect(cards.filter(c => c.pileLabel).map(c => c.index)).toEqual([6]);
  });

  it('never reports a pile of 1, at any depth or active index', () => {
    for (let length = 1; length <= 20; length++) {
      for (let active = 0; active < length; active++) {
        for (const p of computeGeometry(length, active, params()).piles) {
          expect(p.count).toBeGreaterThanOrEqual(2);
          expect(p.indices).toHaveLength(p.count);
          expect(p.indices).toContain(p.labelIndex);
        }
      }
    }
  });
});

describe('geometryFor', () => {
  const state = (entries: StackState['entries'], activeSlot: string | null): StackState =>
    ({ entries, activeSlot });

  it('returns nothing for an empty stack', () => {
    expect(geometryFor(state([], null), params())).toEqual({ cards: [], piles: [] });
  });

  it('hands each placement the slot of the entry it places', () => {
    const entries = [cardEntry('a/one'), lensEntry('interesting'), cardEntry('b/two')];
    const { cards } = geometryFor(state(entries, 'lens/interesting'), params());
    expect(cards.map(c => c.slot)).toEqual(['a/one', 'lens/interesting', 'b/two']);
    expect(cards.find(c => c.role === 'active')!.slot).toBe('lens/interesting');
  });

  it('addresses by slot, so two entries sharing a key stay distinguishable', () => {
    // Clearing a filter re-keys a lens onto one already in the stack (#106):
    // the keys collide, the slots do not.
    const first = lensEntry('interesting');
    const second = withFreeSlot([first], lensEntry('interesting'));
    expect(second.key).toBe(first.key);
    expect(second.slot).toBe('lens/interesting#2');

    const entries = [first, cardEntry('a/one'), second];
    const { cards } = geometryFor(state(entries, 'lens/interesting#2'), params());
    expect(cards.map(c => c.slot)).toEqual(['lens/interesting', 'a/one', 'lens/interesting#2']);
    expect(cards.find(c => c.role === 'active')!.slot).toBe('lens/interesting#2');
    expect(cards.find(c => c.slot === 'lens/interesting')!.role).toBe('behind');
  });

  it('falls back to the last entry when the active slot does not resolve', () => {
    const entries = [cardEntry('a/one'), cardEntry('b/two'), cardEntry('c/three')];
    for (const activeSlot of [null, 'nowhere/at/all']) {
      const { cards } = geometryFor(state(entries, activeSlot), params());
      expect(cards.find(c => c.role === 'active')!.slot).toBe('c/three');
    }
  });

  it('carries the placements through untouched', () => {
    const entries = [cardEntry('a/one'), cardEntry('b/two')];
    const zipped = geometryFor(state(entries, 'a/one'), params());
    const plain = computeGeometry(2, 0, params());
    expect(zipped.piles).toEqual(plain.piles);
    expect(zipped.cards.map(({ slot, ...rest }) => rest)).toEqual(plain.cards);
  });
});

describe('scrollTargetFor', () => {
  it('converts the viewport-relative top to a document offset, less the peek', () => {
    expect(scrollTargetFor(200, 1000, 24)).toBe(1176);
  });

  it('is a no-op scroll when the card is already peeking at the top', () => {
    expect(scrollTargetFor(24, 500, 24)).toBe(500);
  });

  it('clamps at 0 rather than asking to scroll above the document origin', () => {
    expect(scrollTargetFor(0, 0, 24)).toBe(0);
    expect(scrollTargetFor(-400, 10, 24)).toBe(0);
  });
});
