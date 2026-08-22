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
// EVERY card in the stack gets a placement — including the ones past the fan's
// cap, which are piled into the last slot rather than omitted. That is not a
// detail: a card left out of the result is a DOM node that gets destroyed and
// rebuilt, so it mounts at its destination instead of travelling there, and
// nothing animates on any change big enough to alter which cards are on screen.
// Persistent nodes are the whole premise of #67's "every card a persistent node
// positioned by a pure function"; omitting the overflow quietly broke it.
//
// It also makes the pile honest. It is not a marker standing in for cards, it
// is the cards, lying on top of each other in one slot — so they animate into
// and out of the pile like anything else.
//
// Nothing here uses `transform` — offsets are `left`/`top`. A transform on an
// ancestor of a dithered surface re-anchors its `background-attachment: fixed`
// grid and brings the shimmer back (see CLAUDE.md § dither), which #98
// confirmed holds for motion and not just at rest.

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
  /** TOTAL slots in the behind fan, pile included — not the number drawn
   *  individually before a pile is added. See `drawnCount`. */
  backwardStrip: number;
  /** TOTAL slots in the ahead fan, pile included. */
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
  /** Stacked in the overflow pile rather than holding a slot of its own. */
  piled: boolean;
  /** The piled card painted last, so the one that carries the "N more" label. */
  pileLabel: boolean;
}

/** A side's overflow pile: which cards are in it, and how many. */
export interface Pile {
  side: 'behind' | 'ahead';
  /** Cards piled. ALWAYS >= 2 — see `drawnCount`. */
  count: number;
  /** Every card in the pile, ordered nearest -> deepest. */
  indices: number[];
  /** The card carrying the label, so the component knows where to hang the
   *  hover split. */
  labelIndex: number;
}

export interface Geometry {
  cards: PlacedCard[];
  piles: Pile[];
}

/** One band of a hovered pile: a card you can click straight to. `count` is 1
 *  for a band standing for a single card, and >1 for the last band when the
 *  pile is deeper than `max` bands. */
export interface PileSection {
  index: number;
  count: number;
}

/** Card-shaped edges drawn per pile. A pile of 40 is still a small pile; past
 *  about three the stacked edges stop adding information, so deeper cards
 *  share the third one's position. */
export const MAX_PILE_LAYERS = 3;

const clampDither = (n: number) => Math.max(0, Math.min(16, Math.round(n)));

/**
 * How many of `total` cards hold a slot of their own, given `slots` total slots
 * with the pile occupying one of them.
 *
 * The pile is a SLOT, not an extra. With four slots and five cards you get
 * three cards and a pile of two — four things on screen, never five. And the
 * pile therefore never reads "1 more": one overflowing card would simply be
 * shown, since it would fit in the slot the pile is occupying.
 */
export function drawnCount(total: number, slots: number): number {
  const s = Math.max(1, slots);
  return total <= s ? total : s - 1;
}

/**
 * Splitting a pile into one band per card it hides, so any of them is one click
 * away rather than several hops back through the stack.
 *
 * Capped by the SAME rule as the fan: the last band is a slot, so it absorbs
 * the remainder rather than being an extra. A band never stands for exactly one
 * card it isn't showing.
 */
export function pileSections(
  indices: readonly number[],
  max: number,
): PileSection[] {
  const m = Math.max(1, max);
  if (indices.length <= m) return indices.map(index => ({ index, count: 1 }));
  const head = indices.slice(0, m - 1).map(index => ({ index, count: 1 }));
  const tail = indices.slice(m - 1);
  return [...head, { index: tail[0], count: tail.length }];
}

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
  const piles: Pile[] = [];
  const a = Math.max(0, Math.min(stackLength - 1, activeIndex));

  cards.push({
    index: a, role: 'active', depth: 0,
    left: 0, top: 0, z: a, dither: 0, extraHeight: 0,
    piled: false, pileLabel: false,
  });

  // ── behind ──
  const behindTotal = a;
  const behindDrawn = drawnCount(behindTotal, p.backwardStrip);
  const behindPileSlot = behindDrawn + 1;
  // Painting order is z = index, so a pile's LARGEST index is painted last and
  // carries the label. Behind, that is the nearest card; ahead it is the
  // deepest. One rule, both sides.
  const behindLabelIndex = a - behindPileSlot;

  for (let d = 1; d <= behindTotal; d++) {
    const piled = d > behindDrawn;
    const slotD = piled ? behindPileSlot : d;
    const layer = piled ? Math.min(d - behindPileSlot, MAX_PILE_LAYERS - 1) : 0;
    const rank = slotD + layer;
    cards.push({
      index: a - d, role: 'behind', depth: d,
      left: -slotD * p.collapsedWidth,
      top: -rank * p.stagger,
      z: a - d,
      dither: clampDither(p.ditherMid + (rank - 1) * p.ditherStep),
      extraHeight: p.bottomEdge === 'flush' ? rank * p.stagger : 0,
      piled,
      pileLabel: piled && a - d === behindLabelIndex,
    });
  }
  if (behindTotal > behindDrawn) {
    const count = behindTotal - behindDrawn;
    piles.push({
      side: 'behind',
      count,
      indices: Array.from({ length: count }, (_, k) => behindLabelIndex - k),
      labelIndex: behindLabelIndex,
    });
  }

  // ── ahead ──
  const aheadTotal = stackLength - 1 - a;
  const aheadDrawn = drawnCount(aheadTotal, p.forwardFan);
  const aheadPileSlot = aheadDrawn + 1;
  const aheadLabelIndex = stackLength - 1;

  for (let d = 1; d <= aheadTotal; d++) {
    const piled = d > aheadDrawn;
    const slotD = piled ? aheadPileSlot : d;
    const layer = piled ? Math.min(d - aheadPileSlot, MAX_PILE_LAYERS - 1) : 0;
    const rank = slotD + layer;
    cards.push({
      index: a + d, role: 'ahead', depth: d,
      left: aheadLeft(slotD, p),
      top: rank * p.stagger,
      z: a + d,
      dither: clampDither(p.ditherMid - (rank - 1) * p.ditherStep),
      extraHeight: p.bottomEdge === 'flush' ? -rank * p.stagger : 0,
      piled,
      pileLabel: piled && a + d === aheadLabelIndex,
    });
  }
  if (aheadTotal > aheadDrawn) {
    const count = aheadTotal - aheadDrawn;
    piles.push({
      side: 'ahead',
      count,
      indices: Array.from({ length: count }, (_, k) => a + aheadPileSlot + k),
      labelIndex: aheadLabelIndex,
    });
  }

  cards.sort((x, y) => x.z - y.z);
  return { cards, piles };
}
