// The pre-paint fan SKELETON (issue #122), the second half of #101's
// reservation.
//
// #101 made a cold-loaded `/card/X?from=A.B` reserve the fan's space before
// paint, so the card the visitor came to read stops jumping. It still draws
// nothing there: the from/to entries are client-side, so the reserved strip is
// empty until the island hydrates — measured at 174ms FCP against 355ms for
// the real spines.
//
// The split this forces is exactly the one the ticket asks for. The inline
// script can count entries out of the URL, but it cannot know their TITLES:
// `stack-manifest.json` is 46KB and arrives as a JS chunk long after the HTML.
// So: SHAPE immediately, titles when they arrive.
//
// Like `stack-reservation.ts`, and for the same reason, this module computes
// the whole thing at BUILD time by running the real `computeGeometry`, and
// Base.astro bakes the result into the page. The inline script performs no
// arithmetic at all — it picks a row and concatenates markup. The slots-vs-rows
// rule, and the ahead fan's "measured off the active card's width" rule, each
// keep exactly one implementation.
//
// Two encoding decisions are load-bearing:
//
// - **`left`/`top` are STRINGS, already in CSS.** An ahead card sits at
//   `activeWidth - forwardOverlap + (d-1) * pitch`, and `activeWidth` is a
//   measured CSS `min()` the script has no access to. Building the table at
//   `activeWidth: 0` yields the OFFSET from that width directly (the term is
//   linear with coefficient 1), and the skeleton's own box is exactly one
//   active-card wide — so the offset is emitted as `calc(100% + Npx)` and the
//   browser resolves it. Formatting it here rather than in the script is what
//   keeps the asymmetry between the two sides out of the inline code.
// - **Cards come out in PAINTING order.** The skeleton is a flat layer with no
//   z-indices of its own, so DOM order is the occlusion. Behind, the nearest
//   card is painted last (it covers the ones further back); ahead, the deepest
//   is. That is `z` ascending on both sides — one rule, taken from the geometry
//   rather than restated as "reverse one of them".
import { computeGeometry, type GeoParams } from './stack-geometry';
import { saturationPoint } from './stack-reservation';

/**
 * One collapsed spine to draw: `[--geo-left, --geo-top, dither level]`, the
 * first two already CSS lengths and the third indexing `--dither-N`.
 *
 * A TUPLE rather than a named-field object, which is the one place this module
 * trades readability for bytes and does it on purpose: the table is baked into
 * an `is:inline` script and therefore emitted verbatim on every page that
 * renders a stack. Naming the three fields costs ~24 bytes per spine across 30
 * tabulated spines — about 750 bytes a page — to say what the destructure at
 * the single consumer says once.
 */
export type SkeletonCard = [left: string, top: string, dither: number];

export interface SkeletonTable {
  /** Indexed by the number of entries behind the active one, saturating. */
  behind: SkeletonCard[][];
  /** Indexed by the number of entries ahead of it, saturating. */
  ahead: SkeletonCard[][];
}

const px = (n: number) => `${Math.round(n)}px`;

/**
 * An ahead card's `left`, as a length relative to the active card's width.
 *
 * The table is built at `activeWidth: 0`, and `aheadLeft` is linear in that
 * width with coefficient 1, so what comes back IS the offset. The skeleton's
 * own box is exactly one active card wide, which is what makes `100%` the
 * right thing to add it to.
 */
const offsetFromActiveWidth = (n: number) => {
  const v = Math.round(n);
  return v < 0 ? `calc(100% - ${-v}px)` : `calc(100% + ${v}px)`;
};

/**
 * The spines each side draws for a given entry count, computed by running the
 * real geometry — never by restating its rules.
 *
 * `activeWidth` is deliberately not a parameter: the table is built at zero so
 * every ahead `left` comes out as the offset from the active card's width, and
 * a caller supplying a real width would silently bake one page's measurement
 * into every page. See the module comment.
 *
 * The row count matches `fanReservationTable`'s, for the same reason: past the
 * fan's cap a side's placements repeat, so the consumer clamps.
 */
export function fanSkeletonTable(params: Omit<GeoParams, 'activeWidth'>): SkeletonTable {
  const p: GeoParams = { ...params, activeWidth: 0 };
  const behind: SkeletonCard[][] = [];
  const ahead: SkeletonCard[][] = [];

  for (let n = 0; n <= saturationPoint(p.backwardStrip); n++) {
    behind.push(
      computeGeometry(n + 1, n, p).cards
        .filter(c => c.role === 'behind')
        .sort((a, b) => a.z - b.z)
        .map((c): SkeletonCard => [px(c.left), px(c.top), c.dither]),
    );
  }
  for (let n = 0; n <= saturationPoint(p.forwardFan); n++) {
    ahead.push(
      computeGeometry(n + 1, 0, p).cards
        .filter(c => c.role === 'ahead')
        .sort((a, b) => a.z - b.z)
        .map((c): SkeletonCard => [offsetFromActiveWidth(c.left), px(c.top), c.dither]),
    );
  }

  return { behind, ahead };
}
