<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { resolveFrontPageSlots } from '../../lib/frontpage';
  import { markDisplayed } from '../../lib/card-view-state';
  import type { FrontPageConfig, ResolvedSlot, SerialisedCardFull } from '../../lib/frontpage';
  import { lensFilterStore } from '../../stores/lens-filter-store';
  import { applyFilters } from '../../dimensions';
  import FrontPageSlots from '../FrontPageSlots.svelte';

  interface Props {
    config: FrontPageConfig;
    cards: SerialisedCardFull[];
    /** Card-backed values from the FULL card set — see applyFilters. */
    cardBackedValues?: string[];
  }

  let { config, cards, cardBackedValues }: Props = $props();

  let resolvedSlots = $state<ResolvedSlot[]>([]);

  onMount(() => {
    // Home is acceptsFilters:false (see lens-registry.ts) — toggling a filter
    // while Home is active falls through to the default browse lens instead
    // of accumulating a selection here, so this is always empty in practice.
    // Applying it anyway keeps the filtering contract uniform across every
    // lens body and stays correct if that ever changes — "further filtering
    // on top of the shared narrowed set" is exactly what Home's day-seeded
    // slot curation already does.
    // status/visibility don't cross the wire on SerialisedCard, and the pool
    // reaching here is already listing-filtered server-side (LensStackCard
    // filters on `.listed` before serialising), so synthesising the published/
    // visible defaults is accurate — the same reasoning, and the same values,
    // as resolveFrontPageSlots applies to this pool a few lines below.
    const cardMetas = cards.map(c => ({
      ...c,
      date: c.date ? new Date(c.date) : undefined,
      status: 'published' as const,
      visibility: { listed: true, reachable: true },
    }));
    const filtered = applyFilters(
      cardMetas,
      get(lensFilterStore),
      cardBackedValues ? new Set(cardBackedValues) : undefined,
    );
    const serialisedFiltered = filtered.map(c => ({ ...c, date: c.date?.toISOString() ?? null }));

    const { slots, displayed } = resolveFrontPageSlots(
      config,
      serialisedFiltered,
      new Date(),
      cardBackedValues ? new Set(cardBackedValues) : undefined,
    );
    for (const d of displayed) markDisplayed(d.uid, d.contentHash);
    resolvedSlots = slots;
  });
</script>

<FrontPageSlots slots={resolvedSlots} />
