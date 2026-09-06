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
  import type { LensDefinition } from '../lib/lens-registry';
  import { lensUid, DEFAULT_BROWSE_LENS_ID } from '../lib/lens-registry';
  import { LENS_BASE } from '../lib/stack-codec';
  import { poolFailureMessage } from '../lib/browse-skeleton';
  import {
    loadCardPool,
    failureReason,
    type CardPoolFailureReason,
  } from '../lib/card-pool.client';
  import type { SharedCardPoolAsset } from '../lib/card-pool';
  import FilterBar from './FilterBar.svelte';
  import ActiveFilterChips from './ActiveFilterChips.svelte';

  interface Props {
    lens: LensDefinition;
    /**
     * The pool source, injected so a test can drive this island against a fake
     * one — the same seam `createCardFragments({ load })` is for the stack.
     * Production never passes it.
     */
    loadPool?: () => Promise<SharedCardPoolAsset>;
  }

  let { lens, loadPool = loadCardPool }: Props = $props();

  /**
   * The bar itself needs none of this and never waits for it: its buttons come
   * from the static FIVE_W_DIMENSIONS, so it renders complete at first paint
   * (#140). What waits is what goes INSIDE a panel.
   *
   * `null` until the pool lands, and the empty object is what reaches FilterBar
   * meanwhile — which disables every dimension button for free, since
   * `hasNodes` is already the thing that decides that. The button's tooltip is
   * what has to be told the difference (see DimensionButton.poolState): a panel
   * that cannot open because its values are in flight is not a dimension with
   * no values.
   */
  let pool = $state<SharedCardPoolAsset | null>(null);
  let failure = $state<CardPoolFailureReason | null>(null);

  const hierarchies = $derived(pool?.hierarchies ?? {});
  const groupOrder = $derived(pool?.groupOrder ?? {});
  const tagDisplay = $derived(pool?.tagDisplay ?? {});
  const poolState = $derived<'ready' | 'pending' | 'failed'>(
    pool ? 'ready' : failure ? 'failed' : 'pending',
  );

  // One attempt. A failure is dropped by the loader, so calling this again is
  // the whole of the retry contract (see card-pool.client.ts).
  function requestPool() {
    failure = null;
    loadPool()
      .then(asset => {
        pool = asset;
      })
      .catch(error => {
        failure = failureReason(error);
      });
  }

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
    requestPool();
    enforceNoFilters();
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
  {poolState}
  filterState={$lensFilterStore}
  onFilterToggle={handleFilterToggle}
  onClearDimension={handleClearDimension}
/>

<!-- ONE control per failed fetch, not one per dimension — five buttons for a
     single failed request offers a choice that does not exist (settled for
     home in slice 6). The message is the same decision the browse skeleton
     renders, so the two surfaces cannot word the same failure differently. -->
{#if failure}
  <div class="lens-filter-pool-failure">
    <p class="fp-pool-error">{poolFailureMessage(failure)}</p>
    <button type="button" class="fp-pool-retry" onclick={requestPool}>Try again</button>
  </div>
{/if}

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
  /* The islands exception (CLAUDE.md): a .svelte component's styles ship with
     its own island and hydrate wherever it lands, so these live here rather
     than in global.css. Duplicated from BrowseSkeleton for the same reason
     home's copy is — the two are never co-resident. */
  .lens-filter-pool-failure {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm);
    flex-wrap: wrap;
    margin-top: var(--space-sm);
  }

  .fp-pool-error {
    margin: 0;
    font-size: 0.9rem;
    color: var(--color-text-muted);
  }

  .fp-pool-retry {
    font-family: var(--font-heading);
    font-size: 0.85rem;
    padding: 0.2rem 0.6rem;
    border: var(--border-width) solid var(--color-border);
    background: transparent;
    color: var(--color-text);
    cursor: pointer;
  }

  .fp-pool-retry:hover {
    background: var(--color-bg-hover);
  }

  .lens-filter-fallthrough-trigger {
    position: absolute;
    width: 0;
    height: 0;
    padding: 0;
    border: 0;
    overflow: hidden;
  }
</style>
