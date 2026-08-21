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
  /** How far an ahead-card reaches back over the active card's inset, px. */
  forwardOverlap: number;
  /** Max behind-cards drawn individually before an overflow strip. */
  backwardStrip: number;
  /** Max ahead-cards drawn individually before an "N ahead" marker. */
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

export interface Marker {
  side: 'behind' | 'ahead';
  count: number;
  left: number;
  top: number;
  z: number;
  dither: number;
}

export interface Geometry {
  cards: PlacedCard[];
  markers: Marker[];
}

const clampDither = (n: number) => Math.max(0, Math.min(16, Math.round(n)));

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
  const behindDrawn = Math.min(behindTotal, p.backwardStrip);
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
    const d = behindDrawn + 1;
    markers.push({
      side: 'behind', count: behindTotal - behindDrawn,
      left: -d * p.collapsedWidth,
      top: -d * p.stagger,
      z: a - d,
      dither: clampDither(p.ditherMid + (d - 1) * p.ditherStep),
    });
  }

  // ── ahead ──
  const aheadTotal = stackLength - 1 - a;
  const aheadDrawn = Math.min(aheadTotal, p.forwardFan);
  for (let d = 1; d <= aheadDrawn; d++) {
    cards.push({
      index: a + d, role: 'ahead', depth: d,
      left: p.activeWidth - p.forwardOverlap + (d - 1) * p.collapsedWidth,
      top: d * p.stagger,
      z: a + d,
      dither: clampDither(p.ditherMid - (d - 1) * p.ditherStep),
      extraHeight: p.bottomEdge === 'flush' ? -d * p.stagger : 0,
    });
  }
  if (aheadTotal > aheadDrawn) {
    const d = aheadDrawn + 1;
    markers.push({
      side: 'ahead', count: aheadTotal - aheadDrawn,
      left: p.activeWidth - p.forwardOverlap + (d - 1) * p.collapsedWidth,
      top: d * p.stagger,
      z: a + d,
      dither: clampDither(p.ditherMid - (d - 1) * p.ditherStep),
    });
  }

  cards.sort((x, y) => x.z - y.z);
  return { cards, markers };
}
