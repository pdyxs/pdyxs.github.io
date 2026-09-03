// The results-area loading state for a filtered (or re-ranked) cold load —
// issue #119, part of #118.
//
// Base.astro's pre-paint script sets `data-filters-pending` and global.css
// hides `.fp-browse-list` / `.fp-result-count` until the island commits the
// reduced set. Measured on a warm wired dev server that guard leaves ~470ms of
// EMPTY SPACE below an already-populated filter bar; on a real connection it is
// much longer. The skeleton is what stands in that gap.
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
