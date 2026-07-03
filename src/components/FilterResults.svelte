<script lang="ts">
  import { createFilterState } from '../lib/use-filter-state.svelte';
  import type { SerialisedCardFull } from '../lib/frontpage';
  import BrowseResults from './BrowseResults.svelte';

  interface Props {
    cards: SerialisedCardFull[];
  }

  let { cards }: Props = $props();

  const filter = createFilterState(() => cards);
</script>

{#if filter.hasActiveFilters}
  <BrowseResults cards={filter.filteredCards} />
{:else}
  <p class="filter-empty">No filter specified.</p>
{/if}

<style>
  .filter-empty {
    color: var(--color-text-muted);
    font-style: italic;
    padding: var(--space-md) 0;
  }
</style>
