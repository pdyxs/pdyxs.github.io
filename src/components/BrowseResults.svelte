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

  .fp-browse-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-md);
  }
</style>
