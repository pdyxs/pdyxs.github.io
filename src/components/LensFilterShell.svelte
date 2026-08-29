<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { lensFilterStore } from '../stores/lens-filter-store';
  import {
    clearDimension,
    emptyFilterState,
    filterStateToParams,
    hasAnySelection,
    stripFilterParams,
    toggleValue,
  } from '../dimensions';
  import type { DimensionId, FilterState } from '../dimensions';
  import type { FiveWDimension } from '../lib/five-w';
  import type { LensDefinition } from '../lib/lens-registry';
  import { lensUid, DEFAULT_BROWSE_LENS_ID } from '../lib/lens-registry';
  import { LENS_BASE } from '../lib/stack-codec';
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

  // The selection is NOT read from the URL here any more (issue #100). A lens
  // location's identity *is* the lens plus its filter set, so the selection
  // lives in the location's key and CardStack — the sole owner of stack state —
  // mirrors the active location's filters into lensFilterStore. Reading the URL
  // on mount is precisely what let an already-mounted lens and the stack's own
  // params disagree: the shell mounted once, long before the filters changed.
  //
  // A lens that can't accept filters must still never show any as active, no
  // matter how a stray filter.* query string got onto its URL (a hand-edited or
  // shared link). This is the single enforcement point, so every path into a
  // non-accepting lens is covered without patching each call site.
  function enforceNoFilters() {
    if (lens.acceptsFilters) return;
    // ...and only when THIS lens is the active location. Every entry in the
    // stack renders its own shell — a `from` entry is collapsed, not absent —
    // so a cold load of `/lens/interesting?filter.what=...&from=0` mounts the
    // home lens's shell too, and un-gated it stripped the ACTIVE lens's
    // filters out of the shared store and the URL (the same class of bug as
    // the floating series arrows: a rule about the active card written where
    // every card can run it). The active location is the one named in the
    // path, which is the codec's own contract (`pathForActive`).
    if (window.location.pathname !== `${LENS_BASE}/${lens.id}`) return;
    lensFilterStore.set(emptyFilterState());
    const current = window.location.search;
    const strippedQuery = stripFilterParams(new URLSearchParams(current)).toString();
    const strippedSearch = strippedQuery ? `?${strippedQuery}` : '';
    if (strippedSearch !== current) {
      history.replaceState(null, '', `${window.location.pathname}${strippedSearch}`);
    }
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
    enforceNoFilters();
    // `lensFiltersSynced` (the anti-FOUC guard's release) is set by CardStack
    // alongside the store it now seeds — one signal, one owner.
    window.addEventListener('popstate', enforceNoFilters);
    return () => window.removeEventListener('popstate', enforceNoFilters);
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
