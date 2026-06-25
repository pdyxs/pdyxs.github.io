<script lang="ts">
  import type { CardMeta } from '../lib/cards';
  import BrowseCard from './BrowseCard.svelte';

  interface Props {
    cards: CardMeta[];
  }

  let { cards }: Props = $props();
</script>

<main class="fp-browse-grid" aria-label="Browse results">
  <p class="fp-result-count">
    {cards.length} card{cards.length === 1 ? '' : 's'}
  </p>

  {#if cards.length === 0}
    <p class="fp-browse-empty">No cards match the current filters.</p>
  {:else}
    <ul class="fp-browse-list">
      {#each cards as card (card.uid)}
        <BrowseCard {card} />
      {/each}
    </ul>
  {/if}
</main>

<style>
  .fp-browse-grid {
    padding: var(--space-md) var(--space-lg);
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
