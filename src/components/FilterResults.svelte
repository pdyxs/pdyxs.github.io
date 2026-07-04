<script lang="ts">
  import { createFilterState } from '../lib/use-filter-state.svelte';
  import type { SerialisedCardFull } from '../lib/frontpage';
  import type { Dimension } from '../lib/filters';
  import type { TagNode } from '../lib/browse-helpers';
  import FilterBar from './FilterBar.svelte';
  import BrowseResults from './BrowseResults.svelte';

  interface Props {
    cards: SerialisedCardFull[];
    hierarchies: Record<Dimension, TagNode[]>;
  }

  let { cards, hierarchies }: Props = $props();

  const filter = createFilterState(() => cards, '/card/filter');
</script>

<FilterBar
  {hierarchies}
  filterState={filter.filterState}
  onFilterToggle={filter.toggle}
  onClearDimension={filter.clearDimension}
/>

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
