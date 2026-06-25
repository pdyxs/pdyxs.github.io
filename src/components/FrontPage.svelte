<script lang="ts">
  import { onMount } from 'svelte';
  import { selectSlotCard } from '../lib/slot-selection';
  import { markDisplayed } from '../lib/card-view-state';
  import { buildBrowseUrl } from '../lib/frontpage';
  import type { FrontPageConfig, ResolvedSlot, SerialisedCardFull } from '../lib/frontpage';
  import {
    filterStateFromParams,
    filterStateToParams,
    applyFilters,
  } from '../lib/filters';
  import type { FilterState, Dimension } from '../lib/filters';
  import type { TagNode } from '../lib/browse-helpers';
  import FilterBar from './FilterBar.svelte';
  import ActiveFilterChips from './ActiveFilterChips.svelte';
  import BrowseResults from './BrowseResults.svelte';
  import FrontPageSlots from './FrontPageSlots.svelte';

  interface Props {
    config: FrontPageConfig;
    cards: SerialisedCardFull[];
    hierarchies: Record<Dimension, TagNode[]>;
  }

  let { config, cards, hierarchies }: Props = $props();

  // ── Filter state ──────────────────────────────────────────────────────────

  let filterState = $state<FilterState>({ selections: {} });
  let resolvedSlots = $state<ResolvedSlot[]>([]);

  const hasActiveFilters = $derived(
    Object.values(filterState.selections).some(v => v && v.length > 0)
  );

  const cardMetas = $derived(
    cards.map(c => ({ ...c, date: c.date ? new Date(c.date) : undefined }))
  );

  const filteredCards = $derived(applyFilters(cardMetas, filterState));

  // ── URL sync ──────────────────────────────────────────────────────────────

  function pushToUrl(state: FilterState) {
    const params = filterStateToParams(state);
    const query = params.toString();
    history.pushState(null, '', query ? `/?${query}` : '/');
  }

  // ── Filter mutations ──────────────────────────────────────────────────────

  function toggleFilterValue(dim: Dimension, value: string) {
    const existing = filterState.selections[dim] ?? [];
    const updated = existing.includes(value)
      ? existing.filter(v => v !== value)
      : [...existing, value];
    const newSelections = { ...filterState.selections };
    if (updated.length === 0) {
      delete newSelections[dim];
    } else {
      newSelections[dim] = updated;
    }
    filterState = { ...filterState, selections: newSelections };
    pushToUrl(filterState);
  }

  function clearDimension(dim: Dimension) {
    const newSelections = { ...filterState.selections };
    delete newSelections[dim];
    filterState = { ...filterState, selections: newSelections };
    pushToUrl(filterState);
  }

  function clearAllFilters() {
    filterState = { selections: {} };
    pushToUrl(filterState);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  onMount(() => {
    filterState = filterStateFromParams(new URLSearchParams(window.location.search));

    function onPopstate() {
      filterState = filterStateFromParams(new URLSearchParams(window.location.search));
    }
    window.addEventListener('popstate', onPopstate);

    const now = new Date();
    const byUid = new Map(cards.map(c => [c.uid, c]));
    const resolved: ResolvedSlot[] = [];

    for (const slot of config.slots) {
      if (slot.type === 'pinned') {
        const card = byUid.get(slot.uid);
        if (card) resolved.push({ type: 'pinned', uid: card.uid, title: card.title, description: card.description });
      } else {
        const meta = selectSlotCard(cardMetas, slot.filter, now);
        if (meta) markDisplayed(meta.uid, meta.contentHash);
        const card = meta ? byUid.get(meta.uid) ?? null : null;
        resolved.push({ type: 'filter', label: slot.label, card, browseUrl: buildBrowseUrl(slot.filter) });
      }
    }

    resolvedSlots = resolved;

    return () => window.removeEventListener('popstate', onPopstate);
  });
</script>

<div class="fp-page">
  <FilterBar
    {hierarchies}
    {filterState}
    {hasActiveFilters}
    onFilterToggle={toggleFilterValue}
    onClearDimension={clearDimension}
    onClearAll={clearAllFilters}
  />

  {#if hasActiveFilters}
    <ActiveFilterChips {filterState} onRemove={toggleFilterValue} />
    <BrowseResults cards={filteredCards} />
  {:else}
    <FrontPageSlots slots={resolvedSlots} />
  {/if}
</div>

<style>
  .fp-page {
    display: flex;
    flex-direction: column;
  }
</style>
