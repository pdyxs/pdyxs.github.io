// The pre-hydration fan reservation (issue #101).
//
// A cold-loaded `/card/X?from=A.B.C` renders X alone: the from/to entries are
// client-side, so at first paint the stack has no fan and `.card-stack-inner`
// carries none of the margins that make room for one. When the island hydrates
// it writes them, and the card the visitor came to read jumps — measured at
// 60px right and 40px down for a three-slot fan at 1400px.
//
// Removing that needs four numbers before any module loads, which is a problem:
// an inline `<head>` script cannot import, so anything it computes is a second
// implementation of the geometry — and the slots-vs-rows distinction it would
// have to restate is precisely the one that was already got wrong once (the
// vertical axis reserves ROWS, because a piled card shares its slot's `left`
// but keeps climbing in `top`).
//
// So the script computes nothing. This module builds a small TABLE by calling
// `computeGeometry` itself, Base.astro bakes it into the page at build time,
// and the inline script counts entries and reads a row out of it. The geometry
// has exactly one implementation; what is duplicated is an array index.
//
// The table is short because the reservation SATURATES: past the fan's slot cap
// a side's slots stop growing (`slotsUsed` is a `min`) and its rows stop one
// pile-depth later. Six rows per side covers every stack that will ever exist.
import { computeGeometry, MAX_PILE_LAYERS, type GeoParams } from './stack-geometry';

/** What one side of the fan reserves: `slots` horizontally, `rows` vertically. */
export interface FanReservation {
  slots: number;
  rows: number;
}

export interface ReservationTable {
  /** Indexed by the number of entries behind the active one, saturating. */
  behind: FanReservation[];
  /** Indexed by the number of entries ahead of it, saturating. */
  ahead: FanReservation[];
}

/**
 * The largest side-count worth tabulating. Beyond it every row repeats, so the
 * consumer clamps rather than the table growing.
 *
 * `cap + MAX_PILE_LAYERS - 1` is where rows stop moving: the pile occupies slot
 * `cap`, and its deepest drawn edge sits `MAX_PILE_LAYERS - 1` further down.
 *
 * Exported for `stack-skeleton.ts`, which tabulates the same counts and must
 * saturate at the same place — two tables handed to the same inline script and
 * indexed by the same entry count cannot be allowed to disagree about where
 * clamping starts.
 */
export function saturationPoint(cap: number): number {
  return Math.max(0, cap) + MAX_PILE_LAYERS - 1;
}

/**
 * A lookup table of what each side reserves, computed by running the real
 * geometry — never by restating its rules.
 *
 * `computeGeometry` is asked the two degenerate questions it already answers:
 * a stack of `n + 1` with the LAST entry active has `n` behind and none ahead;
 * with the FIRST active, `n` ahead and none behind.
 */
export function fanReservationTable(params: GeoParams): ReservationTable {
  const behind: FanReservation[] = [];
  const ahead: FanReservation[] = [];

  for (let n = 0; n <= saturationPoint(params.backwardStrip); n++) {
    const geo = computeGeometry(n + 1, n, params);
    behind.push({ slots: geo.behindSlots, rows: geo.behindRows });
  }
  for (let n = 0; n <= saturationPoint(params.forwardFan); n++) {
    const geo = computeGeometry(n + 1, 0, params);
    ahead.push({ slots: geo.aheadSlots, rows: geo.aheadRows });
  }

  return { behind, ahead };
}

/** The row for `count` entries on a side, clamped into the table. */
export function reservationFor(side: readonly FanReservation[], count: number): FanReservation {
  if (side.length === 0) return { slots: 0, rows: 0 };
  return side[Math.min(Math.max(0, count), side.length - 1)];
}
