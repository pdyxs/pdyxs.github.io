<script lang="ts">
  import { DIMENSIONS } from '../lib/filters';
  import type { Dimension, FilterState } from '../lib/filters';
  import { displayFor } from '../lib/tag-display';
  import type { TagDisplay } from '../lib/tag-display';

  interface Props {
    filterState: FilterState;
    onRemove: (dim: Dimension, value: string) => void;
    /** Removes a dimensionless filter (see filters.ts's `tags` bucket). */
    onRemoveTag: (value: string) => void;
    /** Removes the dev-only status facet selection (issue #52). */
    onRemoveStatus: () => void;
    onClearAll: () => void;
    /** Flat value -> display-name map from the tag registry (see tag-registry.ts's flattenTagDisplay), serialised in from the server. */
    tagDisplay?: Record<string, TagDisplay>;
  }

  let { filterState, onRemove, onRemoveTag, onRemoveStatus, onClearAll, tagDisplay = {} }: Props = $props();
</script>

<div class="fp-active-filters" aria-label="Active filters">
  {#each DIMENSIONS as dim}
    {#each (filterState.selections[dim] ?? []) as val}
      {@const name = displayFor(val, tagDisplay).name}
      <button
        class="fp-filter-chip"
        onclick={() => onRemove(dim, val)}
        aria-label="Remove filter: {name}"
      >
        {name} ×
      </button>
    {/each}
  {/each}
  {#each (filterState.tags ?? []) as val}
    {@const name = displayFor(val, tagDisplay).name}
    <button
      class="fp-filter-chip"
      onclick={() => onRemoveTag(val)}
      aria-label="Remove filter: {name}"
    >
      {name} ×
    </button>
  {/each}
  {#if import.meta.env.DEV && filterState.status}
    <button
      class="fp-filter-chip"
      onclick={onRemoveStatus}
      aria-label="Remove filter: {filterState.status}"
    >
      {filterState.status} ×
    </button>
  {/if}
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

  /* An active filter is a selected control by definition — it uses the shared
     inverted-surface treatment (--color-selected-* in global.css). */
  .fp-filter-chip {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    padding: 2px var(--space-sm);
    border: 1px solid var(--color-selected-bg);
    background: var(--color-selected-bg);
    color: var(--color-selected-fg);
    -webkit-text-stroke-color: var(--color-selected-bg);
    cursor: pointer;
  }

  .fp-filter-chip:hover {
    background: var(--color-selected-bg-hover);
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
