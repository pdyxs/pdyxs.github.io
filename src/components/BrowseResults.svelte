<script lang="ts">
  import type { CardMeta } from '../lib/cards';
  import type { TagDisplay } from '../lib/tag-display';
  import type { FilterState } from '../dimensions';
  import type { StripTerminal } from '../lib/strip-lens';
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
  }

  let {
    cards,
    tagDisplay = {},
    filterState = { },
    totalCount,
    layout = 'grid',
    terminal,
    emptyMessage = 'No cards match the current filters.',
  }: Props = $props();

  const count = $derived(totalCount ?? cards.length);
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
      {#each cards as card (card.uid)}
        <BrowseCard {card} {tagDisplay} {filterState} />
      {/each}
    </ul>
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

  .fp-browse-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-md);
  }
</style>
