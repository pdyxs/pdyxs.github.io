import { describe, it, expect } from 'vitest';
import { fanSkeletonTable } from './stack-skeleton';
import { fanReservationTable, reservationFor } from './stack-reservation';
import { computeGeometry, STACK_GEOMETRY, type GeoParams } from './stack-geometry';

const geo = (over: Partial<GeoParams> = {}) => ({ ...STACK_GEOMETRY, activeWidth: 0, ...over });
/** How the table words an offset from the active card's width. */
const cssOffset = (n: number) => (n < 0 ? `calc(100% - ${-n}px)` : `calc(100% + ${n}px)`);

describe('fanSkeletonTable', () => {
  it('places every spine exactly where the applier will', () => {
    // The whole point: what is drawn pre-paint must land under what hydration
    // draws, or the skeleton trades an empty strip for a visible shift.
    const p = geo();
    const { behind, ahead } = fanSkeletonTable(STACK_GEOMETRY);

    for (let n = 0; n < behind.length; n++) {
      const real = computeGeometry(n + 1, n, p).cards.filter(c => c.role === 'behind');
      expect(behind[n]).toHaveLength(real.length);
      for (const card of real) {
        expect(behind[n]).toContainEqual([`${card.left}px`, `${card.top}px`, card.dither]);
      }
    }
    for (let n = 0; n < ahead.length; n++) {
      const real = computeGeometry(n + 1, 0, p).cards.filter(c => c.role === 'ahead');
      expect(ahead[n]).toHaveLength(real.length);
      for (const card of real) {
        expect(ahead[n]).toContainEqual([cssOffset(card.left), `${card.top}px`, card.dither]);
      }
    }
  });

  it("measures the ahead fan off the active card's width, not off zero", () => {
    // The skeleton's own box is exactly one active card wide, so `100%` IS
    // `activeWidth`. Asserted against a REAL width so a table accidentally
    // built with one would fail here rather than silently baking a single
    // page's measurement into every page.
    const width = 960;
    const { ahead } = fanSkeletonTable(STACK_GEOMETRY);
    const real = computeGeometry(4, 0, geo({ activeWidth: width })).cards
      .filter(c => c.role === 'ahead');

    for (const card of real) {
      const offset = card.left - width;
      expect(ahead[3]).toContainEqual([cssOffset(offset), `${card.top}px`, card.dither]);
    }
  });

  it('orders each side in painting order, so DOM order is the occlusion', () => {
    // The skeleton layer carries no z-index of its own — the last node painted
    // is the one on top. Behind, that must be the NEAREST card (it covers the
    // ones further back); ahead, the DEEPEST. Both are `z` ascending.
    const p = geo();
    const { behind, ahead } = fanSkeletonTable(STACK_GEOMETRY);

    const behindReal = computeGeometry(6, 5, p).cards.filter(c => c.role === 'behind');
    const behindZ = behind[5].map(([left, top]) => behindReal.find(r => `${r.left}px` === left && `${r.top}px` === top)!.z);
    expect(behindZ).toEqual([...behindZ].sort((a, b) => a - b));
    // The nearest behind card is the last one drawn.
    expect(behind[5].at(-1)![0]).toBe(`${-1 * STACK_GEOMETRY.collapsedWidth}px`);

    const aheadReal = computeGeometry(6, 0, p).cards.filter(c => c.role === 'ahead');
    const aheadZ = ahead[5].map(([left, top]) => aheadReal.find(r => cssOffset(r.left) === left && `${r.top}px` === top)!.z);
    expect(aheadZ).toEqual([...aheadZ].sort((a, b) => a - b));
  });

  it('saturates on the same row as the reservation it is indexed beside', () => {
    // Both tables are read with the same clamped entry count. If one saturated
    // a row earlier than the other, a deep stack would reserve one shape and
    // draw a different one.
    const skeleton = fanSkeletonTable(STACK_GEOMETRY);
    const reservation = fanReservationTable(geo());
    expect(skeleton.behind).toHaveLength(reservation.behind.length);
    expect(skeleton.ahead).toHaveLength(reservation.ahead.length);

    // ...and the last row genuinely fills the slots the reservation claims.
    const lastBehind = reservationFor(reservation.behind, 99);
    const lefts = new Set(skeleton.behind.at(-1)!.map(([left]) => left));
    expect(lefts.size).toBe(lastBehind.slots);
  });

  it('draws one spine per entry, piled ones included', () => {
    // A piled card shares its slot's `left` but keeps climbing in `top`, so
    // the pile is drawn as stacked edges rather than omitted — the same thing
    // the real geometry does. Omitting them would leave the deepest edges to
    // appear at hydration.
    const { behind } = fanSkeletonTable(STACK_GEOMETRY);
    behind.forEach((cards, n) => expect(cards).toHaveLength(n));
  });
});
