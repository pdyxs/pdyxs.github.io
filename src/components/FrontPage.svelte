<script lang="ts">
  import { onMount } from 'svelte';
  import { selectSlotCard } from '../lib/slot-selection';
  import { markDisplayed } from '../lib/card-view-state';
  import { buildBrowseUrl } from '../lib/frontpage';
  import type { FrontPageConfig, ResolvedSlot, SerialisedCardFull } from '../lib/frontpage';
  import type { Dimension } from '../lib/filters';
  import type { TagNode } from '../lib/browse-helpers';
  import { createFilterState } from '../lib/use-filter-state.svelte';
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

  const filter = createFilterState(() => cards);

  let resolvedSlots = $state<ResolvedSlot[]>([]);

  onMount(() => {
    const now = new Date();
    const byUid = new Map(cards.map(c => [c.uid, c]));
    const resolved: ResolvedSlot[] = [];

    for (const slot of config.slots) {
      if (slot.type === 'pinned') {
        const card = byUid.get(slot.uid);
        if (card) resolved.push({ type: 'pinned', uid: card.uid, title: card.title, description: card.description });
      } else {
        const meta = selectSlotCard(filter.cardMetas, slot.filter, now);
        if (meta) markDisplayed(meta.uid, meta.contentHash);
        const card = meta ? byUid.get(meta.uid) ?? null : null;
        resolved.push({ type: 'filter', label: slot.label, card, browseUrl: buildBrowseUrl(slot.filter) });
      }
    }

    resolvedSlots = resolved;
  });
</script>

<div class="fp-page">
  <FilterBar
    {hierarchies}
    filterState={filter.filterState}
    hasActiveFilters={filter.hasActiveFilters}
    onFilterToggle={filter.toggle}
    onClearDimension={filter.clearDimension}
    onClearAll={filter.clearAll}
  />

  {#if filter.hasActiveFilters}
    <ActiveFilterChips filterState={filter.filterState} onRemove={filter.toggle} />
    <BrowseResults cards={filter.filteredCards} />
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
