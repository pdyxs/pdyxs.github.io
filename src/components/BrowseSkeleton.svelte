<!--
  The results-area placeholder: pending tiles, and an honest failure state.

  Extracted from BrowseResults.svelte in slice 4 of docs/plans/shared-card-pool.md
  (issue #149). Nothing about the PENDING half changed in that move — the markup,
  the class names and the appearance rules are the ones #119 and #123 shipped, and
  they are load-bearing: global.css names most of them in its `data-filters-pending`
  / `data-stack-resizing` guard rules, which are the only thing that ever reveals
  this component today.

  SPECIFICITY, and why the move is safe (see the note in global.css at the
  `… .fp-browse-grid .fp-skeleton--strip .fp-skeleton-list` rule): Svelte appends
  this component's hash class to every compound of a scoped selector, so
  `.fp-skeleton--strip .fp-skeleton-list` compiles to four classes and out-ranks
  the three-class global rule that hides the tiles when the guard goes `stalled`.
  That is why the global rule names `.fp-browse-grid` as well. Both compounds of
  the scoped rule live in THIS component, exactly as they both lived in
  BrowseResults before — one hash, two compounds, four classes, unchanged. The
  hazard would be splitting that pair across two components, which halves the
  count and silently loses the fight.

  NO ANIMATION, on purpose. The palette is two colours with no grey, so the
  conventional pale-grey shimmer is unrepresentable; softening one with `opacity`
  is a bug per CLAUDE.md; and a moving gradient over a dithered surface is exactly
  the re-rasterisation the fixed dither grid exists to prevent. A
  prefers-reduced-motion visitor would have to be served the static state anyway —
  so the static state is the only one, and the note above the tiles is what says
  "results are coming".
-->
<script lang="ts">
  import { skeletonTiles, skeletonTileCount, poolFailureMessage } from '../lib/browse-skeleton';
  import type { CardPoolFailureReason } from '../lib/card-pool.client';

  interface Props {
    /**
     * Which shape is being stood in for. `grid` wraps; `strip` is one clipped
     * row — the two containers global.css toggles independently, since a strip
     * lens never re-ranks (issue #123).
     */
    layout?: 'grid' | 'strip';
    /**
     * Why the card pool could not be loaded, or `null` while it is still
     * pending. **Nothing sets this yet** — slice 4 is a pure extraction plus
     * two states nothing can reach; slice 5 is what wires the loader in.
     */
    failure?: CardPoolFailureReason | null;
    /**
     * Called by the retry control. `loadCardPool()` drops a failed attempt, so
     * calling it again starts a fresh one — see card-pool.client.ts.
     */
    onRetry?: (() => void) | null;
  }

  let { layout = 'grid', failure = null, onRetry = null }: Props = $props();
</script>

<!-- The loading state for the anti-FOUC guard (issues #119, #123). It is in the
     SSR HTML of every browse lens page and hidden by default; global.css reveals
     it — and hides the real list/strip, count and empty message — for as long as
     the host carries data-filters-pending. The server cannot know the URL had
     filters (the build has no query string), so which of the two is on screen has
     to be a CSS decision, not a conditional render.

     Both layouts get one, from the same tiles: what differs is the container (a
     wrapping grid vs one clipped row) and the count, which is the whole of
     skeletonTileCount(). What the STRIP skeleton deliberately omits is the dot
     track and the terminal tile — see the .fp-skeleton--strip styles.

     A FAILURE is not a pending state and is not guarded: it is island state that
     the visitor must see wherever it is rendered, so .fp-skeleton--failed turns
     the box on itself rather than waiting for an attribute nothing would set. -->
<div class="fp-skeleton fp-skeleton--{layout}" class:fp-skeleton--failed={failure !== null}>
  {#if failure !== null}
    <p class="fp-pool-error">{poolFailureMessage(failure)}</p>
    {#if onRetry}
      <button type="button" class="fp-pool-retry" onclick={() => onRetry?.()}>
        Try again
      </button>
    {/if}
  {:else}
    <p class="fp-skeleton-note">Loading results…</p>
    <p class="fp-skeleton-stalled">
      Filters couldn’t be applied — something stopped this page loading.
      Reloading usually fixes it. The unfiltered list is deliberately not
      shown: the wrong cards are worse than none.
    </p>
    <ul class="fp-skeleton-list" aria-hidden="true">
      {#each skeletonTiles(skeletonTileCount(layout)) as tile (tile)}
        <li class="fp-skeleton-card">
          <div class="fp-skeleton-thumb"></div>
          <div class="fp-skeleton-content">
            <div class="fp-skeleton-line fp-skeleton-line--title"></div>
            <div class="fp-skeleton-line"></div>
            <div class="fp-skeleton-line fp-skeleton-line--short"></div>
            <div class="fp-skeleton-chips">
              <span class="fp-skeleton-chip"></span>
              <span class="fp-skeleton-chip"></span>
            </div>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  /* ── Loading skeleton (issue #119) ─────────────────────────────
     Shown only while the guard host carries data-filters-pending; the display
     toggles live in global.css beside the rest of that guard, so the whole
     "what is on screen during the hole" story is in one place. Appearance stays
     here, which is where .fp-browse-list's own layout already lives. */
  .fp-skeleton {
    display: none;
  }

  /* The one exception, and it is not part of the guard: a failed pool load is a
     fact the island knows and the visitor is owed, so it draws itself. */
  .fp-skeleton--failed {
    display: block;
  }

  .fp-skeleton-note,
  .fp-skeleton-stalled {
    font-family: var(--font-ui);
    font-size: 0.85rem;
    color: var(--color-text-muted);
    margin: 0 0 var(--space-md);
  }

  /* Swapped in by global.css when the 3s safety net gives up. */
  .fp-skeleton-stalled {
    display: none;
    max-width: 44ch;
  }

  .fp-skeleton-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-md);
  }

  /* The same frame, banner ratio and padding rhythm as BrowseCard, so the real
     grid lands into the shape the skeleton was already holding. */
  .fp-skeleton-card {
    border: var(--border-width) solid var(--color-border);
    background: var(--color-surface);
    overflow: hidden;
  }

  .fp-skeleton-thumb {
    aspect-ratio: 16 / 9;
    background: var(--dither-3);
  }

  .fp-skeleton-content {
    padding: var(--space-md);
  }

  .fp-skeleton-line {
    height: 0.7rem;
    margin-bottom: var(--space-xs);
    background: var(--dither-4);
  }

  .fp-skeleton-line--title {
    height: 1rem;
    width: 70%;
    background: var(--dither-6);
  }

  .fp-skeleton-line--short {
    width: 45%;
  }

  /* Varied line lengths, but decided by position rather than at random: these
     nodes are server-rendered and hydration-adopted, so anything non-
     deterministic would differ between the two renders. */
  .fp-skeleton-card:nth-child(2n) .fp-skeleton-line--title { width: 55%; }
  .fp-skeleton-card:nth-child(3n) .fp-skeleton-line--title { width: 82%; }
  .fp-skeleton-card:nth-child(2n) .fp-skeleton-line--short { width: 62%; }

  .fp-skeleton-chips {
    display: flex;
    gap: 4px;
    margin-top: var(--space-sm);
  }

  .fp-skeleton-chip {
    width: 4.5rem;
    height: 1.1rem;
    border: 1px solid var(--color-border-light);
    background: var(--color-surface);
  }

  .fp-skeleton-chip:last-child {
    width: 3rem;
  }

  /* One column below the grid's own breakpoint, where six tiles would be six
     screens of placeholder. Three is still more than a phone shows at once.
     Grid only — the strip's tiles are side by side, so the ones past the clip
     cost a phone no height at all, and hiding the fourth would take away the
     cut-off card that says the row continues. */
  @media (max-width: 700px) {
    .fp-skeleton--grid .fp-skeleton-card:nth-child(n + 4) {
      display: none;
    }
  }

  /* ── Strip variant (issue #123) ────────────────────────────────
     A strip lens (Newest/Oldest) renders CardStrip, which no #119 rule matched
     — so a filtered cold load painted the unfiltered run for ~880ms from first
     paint, which is the literal original report.

     The tiles are the grid's; only the container changes. What is NOT here is
     deliberate:

     - NO DOT TRACK. computeStripDots emits one dot per card, so a track drawn
       now would be drawn for the wrong run — a count we do not have yet stated
       as a picture, which then visibly re-lays-out. The dots are the strip's
       best feature (see "a capped lens browses as a strip" in CLAUDE.md)
       precisely because they are honest about the size of the run.
     - NO TERMINAL TILE. stripTerminal states the TRUE match count, so before
       hydration it can only advertise the unfiltered total: a "See all 268 →"
       about to become "See all 17 →". A wrong number is worse than no number.
     - NO CONTROL ROW at all, and therefore no reserved band for one. The row
       exists only when the run overflows, which is itself a claim about the
       count — a 3-card match gets no controls, so reserving the band would be
       right for some answers and wrong for others.

     Under the shared card pool that reasoning stops being about the FILTERED
     case and becomes universal: the count is never known before the fetch. The
     markup needed no change for it.

     What is left is the one thing a skeleton can honestly say here: results are
     coming, they are cards, and they are one clipped row deep. */
  .fp-skeleton--strip .fp-skeleton-list {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
    /* The same bleed as .card-strip-track, so the real row lands into the shape
       the skeleton was holding rather than shifting by the body inset. */
    margin-inline: calc(-1 * var(--body-inset-inline, 0px));
    padding-inline: var(--body-inset-inline, 0px);
    /* Clipped, never scrollable: the skeleton is not something to explore, and
       a scroller here would offer to page through placeholders. The tile past
       the edge is cut off exactly as a real card is. */
    overflow: hidden;
  }

  /* Same width rule as .card-strip-track's cards, so a tile is the size of the
     preview that replaces it. */
  .fp-skeleton--strip .fp-skeleton-card {
    flex: 0 0 auto;
    width: min(280px, 80%);
  }

  /* ── Failure (issue #149) ──────────────────────────────────────
     The pool is the whole page's content, so a failed load is total rather than
     cosmetic — and unlike a hydration stall it is retryable. The message names
     what went wrong and claims nothing more; poolFailureMessage() is the one
     decision and is unit-tested. */
  .fp-pool-error {
    font-family: var(--font-ui);
    font-size: 0.85rem;
    color: var(--color-text-muted);
    max-width: 44ch;
    margin: 0 0 var(--space-md);
  }

  /* An ordinary flat control: paper at rest, the L2 dither on hover, per the
     selected/flat surface table in CLAUDE.md. Same shape as .fp-reveal-more. */
  .fp-pool-retry {
    font-family: var(--font-ui);
    font-size: 0.9rem;
    color: var(--color-text);
    background: var(--color-bg);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-sm);
    padding: var(--space-sm) var(--space-lg);
    cursor: pointer;
  }

  .fp-pool-retry:hover {
    background: var(--color-bg-hover);
  }
</style>
