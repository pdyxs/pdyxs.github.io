<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { CardMeta } from '../lib/cards';
  import type { TagDisplay } from '../lib/tag-display';
  import type { FilterState } from '../dimensions';
  import type { StripTerminal } from '../lib/strip-lens';
  import {
    revealedAfter,
    revealButtonLabel,
    revealSettings,
    revealStatus,
    REVEAL_ROOT_MARGIN,
    type RevealSettings,
  } from '../lib/progressive-reveal';
  import { skeletonTiles, skeletonTileCount } from '../lib/browse-skeleton';
  import BrowseCard from './BrowseCard.svelte';
  import CardStrip from './CardStrip.svelte';

  interface Props {
    cards: CardMeta[];
    tagDisplay?: Record<string, TagDisplay>;
    /** Active filter selections — drives per-card tag hiding/highlighting.
     * Defaults to no filter (e.g. the "Related" list in GenericRenderer). */
    filterState?: FilterState;
    /** How many cards match before any display limit is applied (see
     * limitCardsForBrowse). The count line reports this, not the number
     * rendered, so a capped lens still shows the true size of the match.
     * Defaults to the rendered count for uncapped callers. */
    totalCount?: number;
    /**
     * How the results are laid out. `grid` (the default) wraps; `strip` is one
     * scrolling row with the dot track — a capped timeline lens, see
     * strip-lens.ts. The count line and the empty state are shared, which is
     * why this is a prop here rather than a second results component.
     */
    layout?: 'grid' | 'strip';
    /** Strip layout only: the tile closing a capped run (see stripTerminal). */
    terminal?: StripTerminal | null;
    /**
     * What to say when nothing is rendered. The default blames the filters,
     * which is the only reason an ordinary browse lens can be empty — the
     * history lenses (issue #84) have several, and decide theirs from the
     * reason (see historyEmptyMessage in src/lib/history-lens.ts).
     */
    emptyMessage?: string;
    /**
     * Progressive reveal for the grid (issue #81) — the caller's lens config
     * decided into settings by revealSettings(). `null` renders the whole set
     * at once. Strip layout ignores it: a strip is capped by `config.limit` and
     * closed by its terminal tile, which is a different answer to the same
     * "this list is too long" question.
     *
     * Defaulted rather than required, so reveal is on for every grid lens at
     * once. It costs a short result set nothing: with nothing held back neither
     * the sentinel nor the button ever renders.
     */
    reveal?: RevealSettings | null;
  }

  let {
    cards,
    tagDisplay = {},
    filterState = { },
    totalCount,
    layout = 'grid',
    terminal,
    emptyMessage = 'No cards match the current filters.',
    reveal = revealSettings(),
  }: Props = $props();

  const count = $derived(totalCount ?? cards.length);

  // --- Progressive reveal -------------------------------------------------
  // Appends only; it never removes a rendered card. See progressive-reveal.ts
  // for why windowing is off the table (the dither's fixed grid).
  // Held as a step COUNT, not a card count — see revealedAfter(). Step zero is
  // the server render, so nothing has to be seeded from the `reveal` prop.
  let revealSteps = $state(0);
  const revealed = $derived(
    reveal ? revealedAfter(reveal, revealSteps, cards.length) : cards.length,
  );
  const status = $derived(revealStatus(cards.length, revealed));
  const visibleCards = $derived(reveal ? cards.slice(0, status.shown) : cards);

  // Back to the first slice whenever the result set changes — a narrowed filter
  // that inherited a deep reveal position would dump 200 cards of a 40-card
  // match in one go. Writes `revealSteps` without reading it, so no loop.
  $effect(() => {
    cards;
    revealSteps = 0;
  });

  // The sentinel is the primary mechanism; the button is what happens when
  // IntersectionObserver isn't there. Resolved on mount so the hydration render
  // matches the server's (which has no observer and must not paint a button
  // that is about to vanish).
  let mounted = $state(false);
  onMount(() => { mounted = true; });
  const hasObserver = $derived(mounted && typeof IntersectionObserver !== 'undefined');

  let sentinel = $state<HTMLElement | null>(null);
  let observer: IntersectionObserver | null = null;

  function revealMore() {
    if (!reveal || !status.more) return;
    revealSteps += 1;
    // Re-arm. IntersectionObserver only reports a *change*, so if the sentinel
    // is still inside the root margin after the append (a tall viewport, a
    // short step) it would sit there intersecting and never fire again —
    // stalling the list at whatever it happened to reach. Unobserving and
    // re-observing forces a fresh initial callback against the new layout.
    tick().then(() => {
      if (observer && sentinel) {
        observer.unobserve(sentinel);
        observer.observe(sentinel);
      }
    });
  }

  $effect(() => {
    const el = sentinel;
    if (!el || !reveal || typeof IntersectionObserver === 'undefined') return;
    observer = new IntersectionObserver(
      entries => { if (entries.some(e => e.isIntersecting)) revealMore(); },
      { rootMargin: REVEAL_ROOT_MARGIN },
    );
    observer.observe(el);
    return () => { observer?.disconnect(); observer = null; };
  });
</script>

<main class="fp-browse-grid" aria-label="Browse results">
  <p class="fp-result-count">
    {count} card{count === 1 ? '' : 's'}
  </p>

  <!-- The loading state for the anti-FOUC guard (issues #119, #123). It is in
       the SSR HTML of every browse lens page and hidden by default; global.css
       reveals it — and hides the real list/strip, count and empty message — for
       as long as <html> carries data-filters-pending. The server cannot know
       the URL had filters (the build has no query string), so which of the two
       is on screen has to be a CSS decision, not a conditional render.

       Both layouts get one, from the same tiles: what differs is the container
       (a wrapping grid vs one clipped row) and the count, which is the whole of
       skeletonTileCount(). What the STRIP skeleton deliberately omits is the
       dot track and the terminal tile — see the .fp-skeleton--strip styles. -->
  <div class="fp-skeleton fp-skeleton--{layout}">
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
  </div>

  {#if cards.length === 0}
    <p class="fp-browse-empty">{emptyMessage}</p>
  {:else if layout === 'strip'}
    <CardStrip cards={cards} {tagDisplay} label="Browse results" {terminal} />
  {:else}
    <ul class="fp-browse-list">
      {#each visibleCards as card (card.uid)}
        <BrowseCard {card} {tagDisplay} {filterState} />
      {/each}
    </ul>

    {#if status.more}
      <!-- Deliberately outside .fp-browse-list: the anti-FOUC guard hides that
           list while a filtered cold load resolves, and a sentinel hidden with
           `display: none` has no box to intersect — the reveal would never
           start. -->
      <div class="fp-reveal" bind:this={sentinel}>
        {#if !hasObserver}
          <button type="button" class="fp-reveal-more" onclick={revealMore}>
            {revealButtonLabel(status.remaining, reveal?.step ?? 0)}
          </button>
        {/if}
      </div>
    {/if}
  {/if}
</main>

<style>
  .fp-browse-grid {
    padding: var(--space-md) 0;
  }

  .fp-result-count {
    font-family: var(--font-ui);
    font-size: 0.85rem;
    color: var(--color-text-muted);
    margin-bottom: var(--space-md);
  }

  .fp-browse-empty {
    color: var(--color-text-muted);
    font-style: italic;
  }

  /* The reveal sentinel. It must keep a box even with nothing in it — a
     zero-height element still intersects, but `display: none` would not. */
  .fp-reveal {
    display: flex;
    justify-content: center;
    padding-top: var(--space-md);
  }

  /* Only ever rendered when IntersectionObserver is missing. Styled as an
     ordinary flat control: paper at rest, the L2 dither on hover, per the
     selected/flat surface table in CLAUDE.md. */
  .fp-reveal-more {
    font-family: var(--font-ui);
    font-size: 0.9rem;
    color: var(--color-text);
    background: var(--color-bg);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-sm);
    padding: var(--space-sm) var(--space-lg);
    cursor: pointer;
  }

  .fp-reveal-more:hover {
    background: var(--color-bg-hover);
  }

  /* ── Loading skeleton (issue #119) ─────────────────────────────
     Shown only while <html> carries data-filters-pending; the display toggles
     live in global.css beside the rest of that guard, so the whole "what is on
     screen during the hole" story is in one place. Appearance stays here,
     which is where .fp-browse-list's own layout already lives.

     NO ANIMATION, on purpose. The palette is two colours with no grey, so the
     conventional pale-grey shimmer is unrepresentable; softening one with
     `opacity` is a bug per CLAUDE.md; and a moving gradient over a dithered
     surface is exactly the re-rasterisation the fixed dither grid exists to
     prevent. A prefers-reduced-motion visitor would have to be served the
     static state anyway — so the static state is the only one, and the note
     above the tiles is what says "results are coming". */
  .fp-skeleton {
    display: none;
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

  .fp-browse-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-md);
  }
</style>
