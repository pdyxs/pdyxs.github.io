<script lang="ts">
  import { DIMENSIONS } from '../lib/filters';
  import type { Dimension, FilterState } from '../lib/filters';

  interface Props {
    filterState: FilterState;
    onRemove: (dim: Dimension, value: string) => void;
  }

  let { filterState, onRemove }: Props = $props();
</script>

<div class="fp-active-filters" aria-label="Active filters">
  {#each DIMENSIONS as dim}
    {#each (filterState.selections[dim] ?? []) as val}
      <button
        class="fp-filter-chip"
        onclick={() => onRemove(dim, val)}
        aria-label="Remove filter: {val}"
      >
        {val} ×
      </button>
    {/each}
  {/each}
</div>

<style>
  .fp-active-filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-lg);
    border-bottom: 1px solid var(--color-border-light);
  }

  .fp-filter-chip {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    padding: 2px var(--space-sm);
    border: 1px solid var(--color-border);
    background: var(--color-text);
    color: var(--color-surface);
    cursor: pointer;
  }

  .fp-filter-chip:hover {
    opacity: 0.8;
  }
</style>
