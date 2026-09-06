import type { CardPoolFailureReason } from './card-pool.client';

// The results-area loading state — issue #119, part of #118.
//
// Originally covered a filtered (or re-ranked) cold load's hydration re-sort,
// via a `data-filters-pending` guard Base.astro's pre-paint script set. That
// guard was removed entirely in #144: since the shared-card-pool map (#136)
// landed, no lens fragment server-renders a results grid for it to have hidden
// — every browse-family body renders this skeleton itself, from `pool ===
// null`, and reveals its final content only once the pool has arrived. What
// survives is the `data-stack-resizing` case (issue #126): a lens change still
// animates the real box, and this skeleton stands in while that resize runs.
//
// Pure by design: the only decision here is how many tiles to draw, and the
// component is the thin applier.

/**
 * How many placeholder tiles the skeleton grid draws.
 *
 * The grid it stands in for renders `DEFAULT_REVEAL_STEP` (24) cards first, and
 * the temptation is to mirror that exactly. Deliberately not:
 *
 * - A skeleton is a promise about *shape*, not about *quantity*. It is on
 *   screen for a few hundred milliseconds and is replaced by a set whose real
 *   size is usually nothing like 24 (the motivating URL matches 17, and a
 *   narrow filter matches 2). Drawing 24 makes a specific numeric claim the
 *   page is about to contradict.
 * - Over-reserving height is its own layout shift. 24 tiles is ~8 rows at the
 *   960px lens width and 24 rows at mobile — a page that scrolls a long way and
 *   then collapses, which is the jump the guard exists to prevent.
 * - Every tile ships in the SSR HTML of every grid lens page, pending or not,
 *   since the server cannot know the URL had filters (the build has no query
 *   string). Six tiles is ~1KB of markup; 24 is four times that on pages that
 *   mostly never show it.
 *
 * Six covers the first screenful at the desktop lens width (two rows of three)
 * and is trimmed to three by the mobile media query, where the grid is one
 * column. Past the fold a skeleton informs nobody.
 */
export const SKELETON_TILE_COUNT = 6;

/**
 * Stable keys for the placeholder tiles. An array rather than a bare count so
 * the `{#each}` has a key that is identical on the server and on hydration —
 * these nodes are in the SSR HTML and must be adopted, not re-created.
 */
export function skeletonTiles(count: number = SKELETON_TILE_COUNT): number[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => i);
}

/**
 * How many placeholder tiles the STRIP skeleton draws (issue #123).
 *
 * A strip is one clipped, scrolling row, so the count answers a different
 * question than the grid's: not "how many rows of results are coming" but "how
 * far does this row reach". Four is the smallest number that overflows the
 * 960px lens width (three 280px cards plus the gaps fill it, so the fourth is
 * the one visibly cut off at the edge) — and a card cut off at the clip IS the
 * strip's affordance, per the CardStrip note about bleeding to the card's
 * edges. Fewer and the skeleton reads as a short, complete run, which is a
 * claim about the count; more is markup nobody can see, since the skeleton row
 * does not scroll.
 *
 * Deliberately smaller than the grid's six: the grid's job is to hold two rows
 * of height, the strip's is to hold ONE row's height and reach past the edge.
 */
export const SKELETON_STRIP_TILE_COUNT = 4;

/**
 * The tile count for a results layout — the one place the grid/strip
 * difference is decided, so neither component has to know the other's number.
 */
export function skeletonTileCount(layout: 'grid' | 'strip'): number {
  return layout === 'strip' ? SKELETON_STRIP_TILE_COUNT : SKELETON_TILE_COUNT;
}

/**
 * What the results area says when the shared card pool could not be loaded
 * (issue #149, slice 4 of docs/plans/shared-card-pool.md).
 *
 * One line per `CardPoolFailureReason`, and the rule is that it must not claim
 * to know more than the loader does. The loader can tell three things apart —
 * the request never finished, the request failed, the response was not a card
 * pool — and nothing else. So there is no "check your connection" (a blocked
 * request and a dead network are the same `TypeError`), no "try again later"
 * (nothing here knows whether later is different), and no card counts.
 *
 * Every message ends at the failure; the retry control beside it is what says
 * what can be done about it. Pure, so the wording is testable without a
 * network — the component is the thin applier.
 */
export function poolFailureMessage(reason: CardPoolFailureReason): string {
  switch (reason) {
    case 'timeout':
      return 'These results are taking too long to load.';
    case 'malformed':
      return "These results didn't arrive in a form this page can read.";
    default:
      return "These results couldn't be loaded.";
  }
}
