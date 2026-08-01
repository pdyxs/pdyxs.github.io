<script lang="ts">
  import { DIMENSIONS } from '../dimensions';
  import type { DimensionId, FilterState } from '../dimensions';
  import type { TagDisplay } from '../lib/tag-display';

  interface Props {
    filterState: FilterState;
    /** Removes one value from one dimension. Same handler the panel uses —
     * toggling an active value off is exactly what a chip's × means. */
    onRemove: (dimensionId: DimensionId, value: string) => void;
    onClearAll: () => void;
    /** Flat value -> display-name map from the tag registry (see tag-registry.ts's flattenTagDisplay), serialised in from the server. */
    tagDisplay?: Record<string, TagDisplay>;
  }

  let { filterState, onRemove, onClearAll, tagDisplay = {} }: Props = $props();

  // One fold over the registry replaces the three parallel render blocks (5 W
  // selections, bare tags, status) and their three removal callbacks. Each
  // dimension supplies its own chip text, so a dev-only dimension needs no
  // import.meta.env.DEV gate here — it simply isn't registered in production.
  const chips = $derived(
    DIMENSIONS.flatMap(dimension =>
      dimension.values(filterState[dimension.id]).map(value => ({
        dimensionId: dimension.id,
        value,
        name: dimension.chipLabel(value, tagDisplay),
      })),
    ),
  );
</script>

<div class="fp-active-filters" aria-label="Active filters">
  {#each chips as chip (chip.dimensionId + '\u0000' + chip.value)}
    <button
      class="fp-filter-chip"
      onclick={() => onRemove(chip.dimensionId, chip.value)}
      aria-label="Remove filter: {chip.name}"
    >
      {chip.name} ×
    </button>
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
