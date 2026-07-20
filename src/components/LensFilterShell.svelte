<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { lensFilterStore, lensFiltersSynced, toggleFilterValue, toggleDimensionlessValue, clearFilterDimension, clearAllFilters, toggleStatusValue, clearStatusFilter } from '../stores/lens-filter-store';
  import { filterStateFromParams, filterStateToParams, stripFilterParams } from '../lib/filters';
  import type { Dimension, FilterState } from '../lib/filters';
  import type { LensDefinition } from '../lib/lens-registry';
  import { lensUid, DEFAULT_BROWSE_LENS_ID } from '../lib/lens-registry';
  import type { TagNode } from '../lib/browse-helpers';
  import type { TagDisplay } from '../lib/tag-display';
  import type { StatusValue } from '../lib/status-visibility';
  import FilterBar from './FilterBar.svelte';
  import ActiveFilterChips from './ActiveFilterChips.svelte';

  interface Props {
    lens: LensDefinition;
    hierarchies: Record<Dimension, TagNode[]>;
    /** Per-dimension panel-section order (see groupNodesIntoSections); passed
     * straight through to FilterBar. */
    groupOrder?: Partial<Record<Dimension, string[]>>;
    tagDisplay?: Record<string, TagDisplay>;
  }

  let { lens, hierarchies, groupOrder = {}, tagDisplay = {} }: Props = $props();

  const hasActiveFilters = $derived(
    Object.values($lensFilterStore.selections).some(v => v && v.length > 0)
    || ($lensFilterStore.tags?.length ?? 0) > 0
    || !!$lensFilterStore.status
  );

  // A lens that can't accept filters must never show any as active, no
  // matter how a stray filter.* query string got onto its URL (carried
  // forward by a lens replacement, left over from closing back to home,
  // a hand-edited/shared link, etc.) — this is the single enforcement
  // point, so every path into a non-accepting lens is covered without
  // having to patch each call site that can navigate here.
  function syncFromUrl() {
    if (!lens.acceptsFilters) {
      lensFilterStore.set({ selections: {} });
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

  // --- Home-fallthrough (acceptsFilters:false) -----------------------------
  // Reuses the existing data-replace-slot/data-replace-params + CardStack's
  // delegated click handler (the same mechanism DimensionPanel's lens list
  // already uses) instead of a second imperative slot-replacement path. tick()
  // flushes the reactive attribute update before the synthetic click fires so
  // CardStack reads the right data-replace-params.
  let fallthroughTrigger: HTMLButtonElement;
  let fallthroughParams = $state('');

  async function fallthroughToDefaultBrowseLens(dim: Dimension, value: string) {
    fallthroughParams = filterStateToParams({ selections: { [dim]: [value] } }).toString();
    await tick();
    fallthroughTrigger?.click();
  }

  async function fallthroughStatusToDefaultBrowseLens(value: StatusValue) {
    fallthroughParams = filterStateToParams({ selections: {}, status: value }).toString();
    await tick();
    fallthroughTrigger?.click();
  }

  function handleFilterToggle(dim: Dimension, value: string) {
    if (!lens.acceptsFilters) {
      fallthroughToDefaultBrowseLens(dim, value);
      return;
    }
    const next = toggleFilterValue($lensFilterStore, dim, value);
    lensFilterStore.set(next);
    reportFiltersToStack(next);
  }

  // Dimensionless filters are never added from the dimension bar — they only
  // arrive via a tag click that opens a fresh browse card. So the shell only
  // needs to remove them (chip ×). Home (acceptsFilters:false) never holds any.
  function handleDimensionlessRemove(value: string) {
    if (!lens.acceptsFilters) return;
    const next = toggleDimensionlessValue($lensFilterStore, value);
    lensFilterStore.set(next);
    reportFiltersToStack(next);
  }

  function handleClearDimension(dim: Dimension) {
    if (!lens.acceptsFilters) return; // Home never accumulates a selection to clear.
    const next = clearFilterDimension($lensFilterStore, dim);
    lensFilterStore.set(next);
    reportFiltersToStack(next);
  }

  function handleClearAll() {
    const next = clearAllFilters();
    lensFilterStore.set(next);
    reportFiltersToStack(next);
  }

  // Dev-only status facet (issue #52). Same acceptsFilters fallthrough as
  // handleFilterToggle — home can't accumulate a status selection, so a
  // click there hands off to the default browse lens instead.
  function handleStatusToggle(value: StatusValue) {
    if (!lens.acceptsFilters) {
      fallthroughStatusToDefaultBrowseLens(value);
      return;
    }
    const next = toggleStatusValue($lensFilterStore, value);
    lensFilterStore.set(next);
    reportFiltersToStack(next);
  }

  function handleRemoveStatus() {
    const next = clearStatusFilter($lensFilterStore);
    lensFilterStore.set(next);
    reportFiltersToStack(next);
  }
</script>

<FilterBar
  {hierarchies}
  {groupOrder}
  filterState={$lensFilterStore}
  onFilterToggle={handleFilterToggle}
  onClearDimension={handleClearDimension}
  onStatusToggle={handleStatusToggle}
/>

{#if hasActiveFilters}
  <ActiveFilterChips
    filterState={$lensFilterStore}
    onRemove={handleFilterToggle}
    onRemoveTag={handleDimensionlessRemove}
    onRemoveStatus={handleRemoveStatus}
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
