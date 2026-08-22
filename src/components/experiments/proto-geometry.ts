// PROTOTYPE (issue #98) — throwaway. The D1 occlusion geometry as one pure
// function, so #99 can lift the validated version into `src/lib/`.
//
// The model: every card is a full-size opaque node the same size as the
// active one. A card `d` steps behind the active sits at x = -d*collapsedWidth,
// y = -d*stagger, painted UNDER it — so painting order alone crops it to a
// `collapsedWidth` sliver of its own LEFT edge. A card `d` steps ahead mirrors
// that on the right and is painted OVER, covering only `forwardOverlap` px of
// the active card's outer inset.
//
// Both sides therefore show a card's left spine, which is why the collapsed
// representation is a single left header and not two.
//
// Nothing here uses `transform` — offsets are `left`/`top`. A transform on an
// ancestor of a dithered surface re-anchors its `background-attachment: fixed`
// grid and brings the shimmer back (see CLAUDE.md § dither).

export type Role = 'behind' | 'active' | 'ahead';
export type BottomEdge = 'staircase' | 'flush';

export interface GeoParams {
  /** Visible sliver of each occluded card, px. */
  collapsedWidth: number;
  /** Vertical step per depth, px. */
  stagger: number;
  /** How far each ahead-card tucks under the one in front of it, px. Applies
   *  at EVERY boundary in the fan, including the active card's — not just the
   *  first, which left the rest of the fan reading as one flush strip. */
  forwardOverlap: number;
  /** TOTAL slots in the behind fan, marker included — not the number drawn
   *  individually before a marker is added. See the counting rule below. */
  backwardStrip: number;
  /** TOTAL slots in the ahead fan, marker included. */
  forwardFan: number;
  /** Dither level of the card one step behind (0 = paper, 16 = ink). */
  ditherMid: number;
  /** Signed ramp per depth: behind ramps toward ink, ahead toward paper. */
  ditherStep: number;
  bottomEdge: BottomEdge;
  /** The active card's width, px — the ahead side is measured off it. */
  activeWidth: number;
}

export interface PlacedCard {
  index: number;
  role: Role;
  /** Steps from the active card; 0 for the active card itself. */
  depth: number;
  left: number;
  top: number;
  z: number;
  /** 0..16, indexing --dither-N. */
  dither: number;
  /** px added to the card's 100% height so bottoms can be made flush. */
  extraHeight: number;
}

/** One card-shaped node in a marker's little pile. A marker stands for two or
 *  more cards lying on top of each other in a single slot, so it is drawn as
 *  that many cards — same size, same ramp, offset only by the stagger, since
 *  they share one slot and so share its x. */
export interface MarkerLayer {
  left: number;
  top: number;
  z: number;
  dither: number;
  /** The layer painted last, which is the one that carries the label. */
  label: boolean;
}

export interface Marker {
  side: 'behind' | 'ahead';
  /** Cards represented. ALWAYS >= 2 — see the counting rule. */
  count: number;
  /** The nearest card the marker stands for: where a bare click resolves to. */
  nearestIndex: number;
  /** Every card it stands for, ordered nearest -> deepest. */
  indices: number[];
  layers: MarkerLayer[];
}

/** One band of a hovered marker: a card you can click straight to. `count` is
 *  1 for a band standing for a single card, and >1 for the last band when the
 *  pile is deeper than `max` bands. */
export interface MarkerSection {
  index: number;
  count: number;
}

/**
 * Splitting a marker into one band per card it hides, so any of them is one
 * click away rather than several hops back through the stack.
 *
 * Capped, and capped by the SAME rule as the fan itself (see `drawnCount`):
 * the last band is a slot, so it absorbs the remainder rather than being an
 * extra. A band therefore never stands for exactly one card it isn't showing.
 */
export function markerSections(
  indices: readonly number[],
  max: number,
): MarkerSection[] {
  const m = Math.max(1, max);
  if (indices.length <= m) return indices.map(index => ({ index, count: 1 }));
  const head = indices.slice(0, m - 1).map(index => ({ index, count: 1 }));
  const tail = indices.slice(m - 1);
  return [...head, { index: tail[0], count: tail.length }];
}

/** Card-shaped edges drawn per marker. A marker for 40 cards is still a small
 *  pile — past about three the pile stops adding information. */
const MAX_MARKER_LAYERS = 3;

/**
 * How many of `total` cards are drawn individually, given `slots` total slots
 * with the marker occupying one of them.
 *
 * The marker is a SLOT, not an extra. With four slots and five cards you get
 * three cards and a marker for two — four things on screen, never five. And
 * the marker therefore never reads "1 more": one hidden card would simply be
 * shown, since it would fit in the slot the marker is occupying.
 */
export function drawnCount(total: number, slots: number): number {
  const s = Math.max(1, slots);
  return total <= s ? total : s - 1;
}

export interface Geometry {
  cards: PlacedCard[];
  markers: Marker[];
}

const clampDither = (n: number) => Math.max(0, Math.min(16, Math.round(n)));

/** Pitch of the ahead fan: the sliver less the overlap, floored so the fan
 *  can never invert when forwardOverlap is scrubbed past collapsedWidth. */
export const aheadPitch = (p: GeoParams) =>
  Math.max(8, p.collapsedWidth - p.forwardOverlap);

const aheadLeft = (d: number, p: GeoParams) =>
  p.activeWidth - p.forwardOverlap + (d - 1) * aheadPitch(p);

export function computeGeometry(
  stackLength: number,
  activeIndex: number,
  p: GeoParams,
): Geometry {
  const cards: PlacedCard[] = [];
  const markers: Marker[] = [];
  const a = Math.max(0, Math.min(stackLength - 1, activeIndex));

  cards.push({
    index: a, role: 'active', depth: 0,
    left: 0, top: 0, z: a, dither: 0, extraHeight: 0,
  });

  // ── behind ──
  const behindTotal = a;
  const behindDrawn = drawnCount(behindTotal, p.backwardStrip);
  for (let d = 1; d <= behindDrawn; d++) {
    cards.push({
      index: a - d, role: 'behind', depth: d,
      left: -d * p.collapsedWidth,
      top: -d * p.stagger,
      z: a - d,
      dither: clampDither(p.ditherMid + (d - 1) * p.ditherStep),
      extraHeight: p.bottomEdge === 'flush' ? d * p.stagger : 0,
    });
  }
  if (behindTotal > behindDrawn) {
    const d = behindDrawn + 1;              // the marker's own slot
    const count = behindTotal - behindDrawn; // >= 2 by drawnCount
    const layers: MarkerLayer[] = [];
    for (let k = 0; k < Math.min(count, MAX_MARKER_LAYERS); k++) {
      layers.push({
        left: -d * p.collapsedWidth,
        top: -(d + k) * p.stagger,
        z: a - d - k,
        dither: clampDither(p.ditherMid + (d - 1 + k) * p.ditherStep),
        label: k === 0,          // nearest layer is painted last on this side
      });
    }
    markers.push({
      side: 'behind', count, nearestIndex: a - d, layers,
      indices: Array.from({ length: count }, (_, k) => a - d - k),
    });
  }

  // ── ahead ──
  const aheadTotal = stackLength - 1 - a;
  const aheadDrawn = drawnCount(aheadTotal, p.forwardFan);
  for (let d = 1; d <= aheadDrawn; d++) {
    cards.push({
      index: a + d, role: 'ahead', depth: d,
      left: aheadLeft(d, p),
      top: d * p.stagger,
      z: a + d,
      dither: clampDither(p.ditherMid - (d - 1) * p.ditherStep),
      extraHeight: p.bottomEdge === 'flush' ? -d * p.stagger : 0,
    });
  }
  if (aheadTotal > aheadDrawn) {
    const d = aheadDrawn + 1;
    const count = aheadTotal - aheadDrawn;
    const n = Math.min(count, MAX_MARKER_LAYERS);
    const layers: MarkerLayer[] = [];
    for (let k = 0; k < n; k++) {
      layers.push({
        left: aheadLeft(d, p),
        top: (d + k) * p.stagger,
        z: a + d + k,
        dither: clampDither(p.ditherMid - (d - 1 + k) * p.ditherStep),
        // ahead cards paint OVER, so the furthest layer is painted last here
        label: k === n - 1,
      });
    }
    markers.push({
      side: 'ahead', count, nearestIndex: a + d, layers,
      indices: Array.from({ length: count }, (_, k) => a + d + k),
    });
  }

  cards.sort((x, y) => x.z - y.z);
  return { cards, markers };
}
