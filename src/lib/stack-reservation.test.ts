import { describe, it, expect } from 'vitest';
import { fanReservationTable, reservationFor } from './stack-reservation';
import { computeGeometry, STACK_GEOMETRY, MAX_PILE_LAYERS, type GeoParams } from './stack-geometry';

const params = (over: Partial<GeoParams> = {}): GeoParams => ({
  ...STACK_GEOMETRY,
  activeWidth: 680,
  ...over,
});

describe('fanReservationTable', () => {
  it('agrees with the geometry for every count, including past saturation', () => {
    // The whole point of the table: the pre-hydration script must reserve
    // EXACTLY what the applier will write, or it trades one shift for another.
    const p = params();
    const { behind, ahead } = fanReservationTable(p);
    for (let n = 0; n <= 30; n++) {
      const behindGeo = computeGeometry(n + 1, n, p);
      expect(reservationFor(behind, n)).toEqual({
        slots: behindGeo.behindSlots,
        rows: behindGeo.behindRows,
      });
      const aheadGeo = computeGeometry(n + 1, 0, p);
      expect(reservationFor(ahead, n)).toEqual({
        slots: aheadGeo.aheadSlots,
        rows: aheadGeo.aheadRows,
      });
    }
  });

  it('reserves ROWS, not slots, on the vertical axis', () => {
    // The distinction the inline script must never be asked to restate: a
    // piled card shares its slot's `left` but keeps climbing in `top`.
    const p = params();
    const { behind } = fanReservationTable(p);
    const deep = reservationFor(behind, 30);
    expect(deep.slots).toBe(p.backwardStrip);
    expect(deep.rows).toBe(p.backwardStrip + MAX_PILE_LAYERS - 1);
    expect(deep.rows).toBeGreaterThan(deep.slots);
  });

  it('saturates exactly at its last row, so it is as short as it can be', () => {
    // The last row is the FIRST saturated one — one shorter and the clamp would
    // start lying, one longer and it would carry a duplicate. Asserted against
    // the geometry rather than against the row before it, which is still
    // climbing.
    const p = params();
    const { behind, ahead } = fanReservationTable(p);
    expect(behind.length).toBeLessThanOrEqual(8);
    expect(ahead.length).toBeLessThanOrEqual(8);

    for (let n = behind.length; n <= behind.length + 5; n++) {
      const geo = computeGeometry(n + 1, n, p);
      expect({ slots: geo.behindSlots, rows: geo.behindRows }).toEqual(behind.at(-1));
    }
    for (let n = ahead.length; n <= ahead.length + 5; n++) {
      const geo = computeGeometry(n + 1, 0, p);
      expect({ slots: geo.aheadSlots, rows: geo.aheadRows }).toEqual(ahead.at(-1));
    }
    // ...and the row before the last is genuinely different, or the table is
    // one longer than it needs to be.
    expect(behind.at(-1)).not.toEqual(behind.at(-2));
  });

  it('reserves nothing for an empty side', () => {
    const { behind, ahead } = fanReservationTable(params());
    expect(reservationFor(behind, 0)).toEqual({ slots: 0, rows: 0 });
    expect(reservationFor(ahead, 0)).toEqual({ slots: 0, rows: 0 });
  });

  it('tracks the parameters rather than hardcoding them', () => {
    const { behind } = fanReservationTable(params({ backwardStrip: 5 }));
    expect(reservationFor(behind, 4)).toEqual({ slots: 4, rows: 4 });
    expect(reservationFor(behind, 99).slots).toBe(5);
  });
});

describe('reservationFor', () => {
  it('clamps rather than reading off the end', () => {
    const side = [{ slots: 0, rows: 0 }, { slots: 1, rows: 1 }];
    expect(reservationFor(side, -3)).toEqual({ slots: 0, rows: 0 });
    expect(reservationFor(side, 99)).toEqual({ slots: 1, rows: 1 });
    expect(reservationFor([], 4)).toEqual({ slots: 0, rows: 0 });
  });
});
