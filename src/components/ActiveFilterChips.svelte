<script lang="ts">
  import { DIMENSIONS } from '../lib/filters';
  import type { Dimension, FilterState } from '../lib/filters';

  interface Props {
    filterState: FilterState;
    onRemove: (dim: Dimension, value: string) => void;
    onClearAll: () => void;
  }

  let { filterState, onRemove, onClearAll }: Props = $props();
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
  <button class="fp-clear-all" onclick={onClearAll} aria-label="Clear all filters">
    Clear all
  </button>
</div>

<style>
  .fp-active-filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    padding: var(--space-xs) 0;
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

  .fp-clear-all {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--color-border-light);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    margin-left: auto;
  }

  .fp-clear-all:hover {
    color: var(--color-text);
    border-color: var(--color-border);
  }
</style>
