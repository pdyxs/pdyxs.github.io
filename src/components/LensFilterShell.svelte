<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { lensFilterStore, lensFiltersSynced } from '../stores/lens-filter-store';
  import {
    clearDimension,
    emptyFilterState,
    filterStateFromParams,
    filterStateToParams,
    hasAnySelection,
    stripFilterParams,
    toggleValue,
  } from '../dimensions';
  import type { DimensionId, FilterState } from '../dimensions';
  import type { FiveWDimension } from '../lib/five-w';
  import type { LensDefinition } from '../lib/lens-registry';
  import { lensUid, DEFAULT_BROWSE_LENS_ID } from '../lib/lens-registry';
  import type { TagNode } from '../lib/browse-helpers';
  import type { TagDisplay } from '../lib/tag-display';
  import FilterBar from './FilterBar.svelte';
  import ActiveFilterChips from './ActiveFilterChips.svelte';

  interface Props {
    lens: LensDefinition;
    hierarchies: Record<string, TagNode[]>;
    /** Per-dimension panel-section order (see groupNodesIntoSections); passed
     * straight through to FilterBar. */
    groupOrder?: Partial<Record<FiveWDimension, string[]>>;
    tagDisplay?: Record<string, TagDisplay>;
  }

  let { lens, hierarchies, groupOrder = {}, tagDisplay = {} }: Props = $props();

  const hasActiveFilters = $derived(hasAnySelection($lensFilterStore));

  // A lens that can't accept filters must never show any as active, no
  // matter how a stray filter.* query string got onto its URL (carried
  // forward by a lens replacement, left over from closing back to home,
  // a hand-edited/shared link, etc.) — this is the single enforcement
  // point, so every path into a non-accepting lens is covered without
  // having to patch each call site that can navigate here.
  function syncFromUrl() {
    if (!lens.acceptsFilters) {
      lensFilterStore.set(emptyFilterState());
      const current = window.location.search;
      const strippedQuery = stripFilterParams(new URLSearchParams(current)).toString();
      const strippedSearch = strippedQuery ? `?${strippedQuery}` : '';
      if (strippedSearch !== current) {
        history.replaceState(null, '', `${window.location.pathname}${strippedSearch}`);
      }
      return;
    }
    lensFilterStore.set(filterStateFromParams(new URLSearchParams(window.location.search)));
  }

  // Report the full filter selection to CardStack (the sole owner of the stack
  // URL) as ordered param pairs, so the selection is serialised into the stack
  // and survives pushing/closing cards. We deliberately do NOT write the URL
  // here — that would race CardStack's own serialisation and drop the filters
  // the moment a card is pushed (the lens becomes an inactive `from` entry
  // whose params come only from CardStack's own map).
  function reportFiltersToStack(state: FilterState) {
    const params: [string, string][] = [...filterStateToParams(state)];
    document.dispatchEvent(new CustomEvent('cardparam', {
      detail: { uid: lensUid(lens.id), params },
    }));
  }

  onMount(() => {
    syncFromUrl();
    // Signal the lens body that the URL selection is now in the store, so it can
    // clear the anti-FOUC guard once its filtered view is committed to the DOM.
    lensFiltersSynced.set(true);
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  });

  function commit(next: FilterState) {
    lensFilterStore.set(next);
    reportFiltersToStack(next);
  }

  // --- Home-fallthrough (acceptsFilters:false) -----------------------------
  // Reuses the existing data-replace-slot/data-replace-params + CardStack's
  // delegated click handler (the same mechanism DimensionPanel's lens list
  // already uses) instead of a second imperative slot-replacement path. tick()
  // flushes the reactive attribute update before the synthetic click fires so
  // CardStack reads the right data-replace-params.
  let fallthroughTrigger: HTMLButtonElement;
  let fallthroughParams = $state('');

  async function fallthroughToDefaultBrowseLens(dimensionId: DimensionId, value: string) {
    fallthroughParams = filterStateToParams(
      toggleValue(emptyFilterState(), dimensionId, value),
    ).toString();
    await tick();
    fallthroughTrigger?.click();
  }

  // One handler for every dimension. The panel reports which axis a value came
  // from (TagNode.dimensionId), so nothing here has to recognise a value by its
  // shape — which is what the old `status:` prefix sniffing existed to do.
  function handleFilterToggle(dimensionId: DimensionId, value: string) {
    if (!lens.acceptsFilters) {
      fallthroughToDefaultBrowseLens(dimensionId, value);
      return;
    }
    commit(toggleValue($lensFilterStore, dimensionId, value));
  }

  function handleClearDimension(dimensionId: DimensionId) {
    if (!lens.acceptsFilters) return; // Home never accumulates a selection to clear.
    commit(clearDimension($lensFilterStore, dimensionId));
  }

  function handleClearAll() {
    commit(emptyFilterState());
  }
</script>

<FilterBar
  {hierarchies}
  {groupOrder}
  filterState={$lensFilterStore}
  onFilterToggle={handleFilterToggle}
  onClearDimension={handleClearDimension}
/>

{#if hasActiveFilters}
  <ActiveFilterChips
    filterState={$lensFilterStore}
    onRemove={handleFilterToggle}
    onClearAll={handleClearAll}
    {tagDisplay}
  />
{/if}

<button
  type="button"
  bind:this={fallthroughTrigger}
  data-replace-slot={lensUid(DEFAULT_BROWSE_LENS_ID)}
  data-replace-params={fallthroughParams}
  class="lens-filter-fallthrough-trigger"
  aria-hidden="true"
  tabindex="-1"
></button>

<style>
  .lens-filter-fallthrough-trigger {
    position: absolute;
    width: 0;
    height: 0;
    padding: 0;
    border: 0;
    overflow: hidden;
  }
</style>
