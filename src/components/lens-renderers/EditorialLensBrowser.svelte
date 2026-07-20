<script lang="ts">
  import { onMount } from 'svelte';
  import { lensFilterStore, lensFiltersSynced } from '../../stores/lens-filter-store';
  import { applyFilters } from '../../lib/filters';
  import type { FilterState } from '../../lib/filters';
  import { groupCardsByStatus } from '../../lib/status-groups';
  import type { SerialisedCardFull } from '../../lib/frontpage';
  import type { TagDisplay } from '../../lib/tag-display';
  import type { StatusValue } from '../../lib/status-visibility';
  import BrowseCard from '../BrowseCard.svelte';

  type EditorialCard = SerialisedCardFull & { status: StatusValue };

  interface Props {
    cards: EditorialCard[];
    tagDisplay?: Record<string, TagDisplay>;
    config?: Record<string, unknown>;
  }

  let { cards, tagDisplay = {} }: Props = $props();

  // The dev-only "what's in flight" dashboard (issue #53): filters the pool
  // by the shared lensFilterStore (same as BrowseLensBrowser.svelte — see its
  // comments for the SSR/hydration-guard rationale), then groups the result
  // by declared status via the pure groupCardsByStatus (src/lib/status-groups.ts).
  let mounted = $state(false);
  onMount(() => { mounted = true; });

  const cardMetas = $derived(
    cards.map(c => ({
      ...c,
      date: c.date ? new Date(c.date) : undefined,
      // Synthetic placeholder — applyFilters/groupCardsByStatus read tags,
      // date and status, never visibility. SerialisedCard (browse-helpers.ts)
      // doesn't carry visibility across the server->client boundary; the same
      // synthesis appears in resolveFrontPageSlots (frontpage.ts) for the
      // identical reason.
      visibility: { listed: true, reachable: true },
    }))
  );
  const activeFilter: FilterState = $derived(mounted ? $lensFilterStore : { selections: {} });
  const filteredCards = $derived(applyFilters(cardMetas, activeFilter));
  const groups = $derived(groupCardsByStatus(filteredCards));

  // Same anti-FOUC clearing as BrowseLensBrowser.svelte.
  $effect(() => {
    groups;
    if (mounted && $lensFiltersSynced) {
      document.documentElement.removeAttribute('data-filters-pending');
    }
  });
</script>

<div class="editorial-groups" aria-label="Editorial status groups">
  {#if groups.length === 0}
    <p class="editorial-empty">Nothing in flight — every card matching the current filters is published.</p>
  {:else}
    {#each groups as group (group.status)}
      <section class="editorial-group">
        <h2 class="editorial-group-heading">
          {group.label} <span class="editorial-group-count">({group.count})</span>
        </h2>
        <ul class="editorial-group-list">
          {#each group.cards as card (card.uid)}
            <BrowseCard {card} {tagDisplay} filterState={activeFilter} />
          {/each}
        </ul>
      </section>
    {/each}
  {/if}
</div>

<style>
  .editorial-groups {
    padding: var(--space-md) 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .editorial-group-heading {
    font-family: var(--font-heading);
    font-size: 1.1rem;
    margin: 0 0 var(--space-sm) 0;
  }

  .editorial-group-count {
    color: var(--color-text-muted);
    font-weight: normal;
    font-size: 0.85em;
  }

  .editorial-group-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-md);
  }

  .editorial-empty {
    color: var(--color-text-muted);
    font-style: italic;
  }
</style>
