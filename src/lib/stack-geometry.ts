// The card-stack occlusion geometry, as one pure function (issue #107).
//
// Lifted from the #98 prototype (`src/components/experiments/proto-geometry.ts`
// on the unmerged `prototype/98-card-stack-geometry` branch, which stays
// unmerged as the record of what was scrubbed and rejected). The parameters
// below are what that scrubbing settled on; the knobs it varied are gone.
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
//
// This module is all decision and no effect: plain numbers in, plain numbers
// out, no DOM, no store, no IO. `geometryFor` is the one function that knows
// what a `LocationEntry` is, and all it does is zip slots onto placements.
import type { StackState } from './stack-layout';

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
  /** Level of the ACTIVE card's own header (0 = paper, 16 = ink). Both ramps
   *  start one step off it, so this is the anchor rather than a member of
   *  either ramp. */
  ditherMid: number;
  /** Signed step per depth going back. Positive ramps toward ink, negative
   *  toward paper — the sign is the direction, so each side can be aimed
   *  independently. Levels clamp to 0..16. */
  ditherStepBack: number;
  /** Signed step per depth going forward. Independent of the back step: the
   *  two sides are different claims (what you came from vs what you closed)
   *  and need not agree on which way is deeper. */
  ditherStepAhead: number;
  bottomEdge: BottomEdge;
  /** The active card's width, px — the ahead side is measured off it. */
  activeWidth: number;
}

/**
 * The parameters #98 settled on. These are NOT knobs: the prototype's sliders
 * existed to find these nine values, and the values are the result. Changing
 * one is a design decision to re-run in a prototype, not a tuning pass here.
 *
 * `activeWidth` is deliberately absent, which is what the `Omit` records. It is
 * the only member of `GeoParams` that is not a settled constant — a card's
 * width cascades from its folder (`width` in `_config.yaml`, browse lenses run
 * 960px against the 680px default), so it is only knowable at the moment the
 * active location is known. Callers spread this const and supply that one
 * field, and the type makes forgetting it a compile error rather than a card
 * fan measured off `undefined`.
 */
export const STACK_GEOMETRY: Omit<GeoParams, 'activeWidth'> = {
  collapsedWidth: 40,
  stagger: 8,
  forwardOverlap: 4,
  backwardStrip: 3,
  forwardFan: 3,
  ditherMid: 5,
  ditherStepBack: -2,
  ditherStepAhead: -2,
  bottomEdge: 'staircase',
};

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
  /** Slots the behind fan occupies — see `slotsUsed`. */
  behindSlots: number;
  /** Slots the ahead fan occupies — see `slotsUsed`. */
  aheadSlots: number;
  /** The behind fan's vertical extent, in `stagger` steps: the largest `rank`
   *  any behind card reaches. NOT `behindSlots` — a piled card adds up to
   *  `MAX_PILE_LAYERS - 1` extra steps on top of the pile's slot, so the fan
   *  climbs higher than it reaches left. Reserving the horizontal count on the
   *  vertical axis leaves the deepest pile edges laid out above the container
   *  and clipped by whatever sits above it. */
  behindRows: number;
  /** The ahead fan's vertical extent, in `stagger` steps. Mirror of the above. */
  aheadRows: number;
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
 * How many SLOTS a side's fan occupies — the individually-drawn cards plus the
 * pile's own slot when there is one, which is just `min(total, slots)`.
 *
 * It exists because the active card's width is measured off it: the fan eats
 * `(behind + ahead) * collapsedWidth` of the viewport, so the two counts are
 * what `--stack-card-width` subtracts. Derived here rather than re-counted from
 * `cards` so there is one statement of "the pile is a slot, not an extra".
 */
export function slotsUsed(total: number, slots: number): number {
  return Math.min(total, Math.max(1, slots));
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
    left: 0, top: 0, z: a,
    // The anchor of both ramps, so every card — active included — carries its
    // level in one field and callers never special-case the active one.
    dither: clampDither(p.ditherMid),
    extraHeight: 0,
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

  let behindRows = 0;
  for (let d = 1; d <= behindTotal; d++) {
    const piled = d > behindDrawn;
    const slotD = piled ? behindPileSlot : d;
    const layer = piled ? Math.min(d - behindPileSlot, MAX_PILE_LAYERS - 1) : 0;
    const rank = slotD + layer;
    behindRows = Math.max(behindRows, rank);
    cards.push({
      index: a - d, role: 'behind', depth: d,
      left: -slotD * p.collapsedWidth,
      top: -rank * p.stagger,
      z: a - d,
      dither: clampDither(p.ditherMid + rank * p.ditherStepBack),
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

  let aheadRows = 0;
  for (let d = 1; d <= aheadTotal; d++) {
    const piled = d > aheadDrawn;
    const slotD = piled ? aheadPileSlot : d;
    const layer = piled ? Math.min(d - aheadPileSlot, MAX_PILE_LAYERS - 1) : 0;
    const rank = slotD + layer;
    aheadRows = Math.max(aheadRows, rank);
    cards.push({
      index: a + d, role: 'ahead', depth: d,
      left: aheadLeft(slotD, p),
      top: rank * p.stagger,
      z: a + d,
      dither: clampDither(p.ditherMid + rank * p.ditherStepAhead),
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
  return {
    cards,
    piles,
    behindSlots: slotsUsed(behindTotal, p.backwardStrip),
    aheadSlots: slotsUsed(aheadTotal, p.forwardFan),
    behindRows,
    aheadRows,
  };
}

/** A placement with the entry it belongs to attached by its ADDRESS. */
export interface PlacedSlot extends PlacedCard {
  /** The `slot` of the entry at `index` — the DOM/fragment-cache handle. Never
   *  the identity `key`: keys are not unique (issue #106), so two entries in
   *  one stack can share one and a key would not address a node. */
  slot: string;
}

export interface SlottedGeometry extends Omit<Geometry, 'cards'> {
  cards: PlacedSlot[];
}

/**
 * The thin zip between the stack's state and the geometry: resolve
 * `activeSlot` to an index, place plain numbers, hand each placement back its
 * slot.
 *
 * This is the ONLY function here that knows a `LocationEntry` exists.
 * `computeGeometry` stays numbers-in/numbers-out so the placement rules can be
 * swept exhaustively in tests without inventing a stack to hold them.
 *
 * An unresolvable `activeSlot` falls back to the LAST entry, matching
 * `computeStackLayout` — the same state, described twice, must not disagree
 * about where the visitor is standing.
 */
export function geometryFor(
  state: StackState,
  params: GeoParams,
): SlottedGeometry {
  const { entries, activeSlot } = state;
  if (entries.length === 0) {
    return { cards: [], piles: [], behindSlots: 0, aheadSlots: 0, behindRows: 0, aheadRows: 0 };
  }

  let activeIdx = activeSlot ? entries.findIndex(e => e.slot === activeSlot) : -1;
  if (activeIdx === -1) activeIdx = entries.length - 1;

  const geo = computeGeometry(entries.length, activeIdx, params);
  return {
    ...geo,
    cards: geo.cards.map(c => ({ ...c, slot: entries[c.index].slot })),
  };
}

/**
 * Where the window should be scrolled so the active card's header sits at the
 * top of the viewport, less a peek.
 *
 * `activeCardTop` is viewport-relative (a `getBoundingClientRect().top`), so
 * `+ scrollY` converts it to a document offset; the applier is a one-line
 * `window.scrollTo`.
 *
 * The peek does two jobs, which is why it is not merely cosmetic:
 *
 * 1. **It is the scroll affordance.** A header flush to the viewport top means
 *    the stack above it is invisible and nothing says it is there.
 * 2. **It keeps the sticky active header unstuck on arrival.** The sticky
 *    header compacts off an IntersectionObserver watching a 1px sentinel at the
 *    card's top edge; flush at the top, that sentinel is already off-screen, so
 *    the header lands *pre-compacted* — and the compact state reads as a
 *    scrolled state, so arriving in it is wrong. A peek leaves the sentinel on
 *    screen: full-size on arrival, compacting the moment you scroll.
 *
 * Clamped at 0 because a card near the top of a short document can compute a
 * negative target, and asking the window to scroll above its own origin is
 * either ignored or (with `behavior: 'smooth'`) a visible bounce.
 */
export function scrollTargetFor(
  activeCardTop: number,
  scrollY: number,
  peek: number,
): number {
  return Math.max(0, activeCardTop + scrollY - peek);
}
