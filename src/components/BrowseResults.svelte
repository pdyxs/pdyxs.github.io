<script lang="ts">
  import type { CardMeta } from '../lib/cards';
  import type { TagDisplay } from '../lib/tag-display';
  import type { FilterState } from '../dimensions';
  import BrowseCard from './BrowseCard.svelte';

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
  }

  let { cards, tagDisplay = {}, filterState = { }, totalCount }: Props = $props();

  const count = $derived(totalCount ?? cards.length);
</script>

<main class="fp-browse-grid" aria-label="Browse results">
  <p class="fp-result-count">
    {count} card{count === 1 ? '' : 's'}
  </p>

  {#if cards.length === 0}
    <p class="fp-browse-empty">No cards match the current filters.</p>
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
