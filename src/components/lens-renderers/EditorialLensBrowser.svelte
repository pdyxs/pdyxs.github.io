<script lang="ts">
  import { onMount } from 'svelte';
  import { lensFilterStore, lensFiltersSynced } from '../../stores/lens-filter-store';
  import { applyFilters } from '../../dimensions';
  import type { FilterState } from '../../dimensions';
  import { groupCardsByStatus } from '../../lib/status-groups';
  import { clearFiltersPending } from '../../lib/filters-pending';
  import {
    loadCardPool,
    failureReason,
    type CardPoolFailureReason,
  } from '../../lib/card-pool.client';
  import type { SharedCardPoolAsset } from '../../lib/card-pool';
  import BrowseCard from '../BrowseCard.svelte';
  import BrowseSkeleton from '../BrowseSkeleton.svelte';

  interface Props {
    config?: Record<string, unknown>;
    /** The pool source, injected so a test can drive this island against a
     * fake one. Production never passes it. */
    loadPool?: () => Promise<SharedCardPoolAsset>;
  }

  let { loadPool = loadCardPool }: Props = $props();

  // The dev-only "what's in flight" dashboard (issue #53): filters the pool
  // by the shared lensFilterStore (same as BrowseLensBrowser.svelte — see its
  // comments), then groups the result by declared status via the pure
  // groupCardsByStatus (src/lib/status-groups.ts).
  //
  // Cut over to the shared card pool in slice 5 of
  // docs/plans/shared-card-pool.md (#150) along with the other two browse-family
  // bodies. It ships in no production build — lens-components.ts gates its
  // loader on import.meta.env.DEV — so it moves no measured number; it is here
  // because a body still reading a prop that slice 8 stops passing would
  // silently render an EMPTY dashboard, which is exactly the failure this lens
  // exists to catch elsewhere.
  //
  // `null` is not `[]`: an empty pool would claim "nothing in flight", which is
  // the one sentence a dashboard about unfinished work must not say while it is
  // still loading.
  let pool = $state<SharedCardPoolAsset | null>(null);
  let failure = $state<CardPoolFailureReason | null>(null);

  function requestPool() {
    failure = null;
    loadPool()
      .then(asset => { pool = asset; })
      .catch(error => { failure = failureReason(error); });
  }

  onMount(requestPool);

  const cards = $derived(pool?.cards ?? []);
  const tagDisplay = $derived(pool?.tagDisplay ?? {});
  const cardBackedValues = $derived(pool?.cardBackedValues);

  const cardMetas = $derived(
    cards.map(c => ({
      ...c,
      date: c.date ? new Date(c.date) : undefined,
      // `status` is optional on the wire (browse-helpers.ts) and this lens is
      // dev-only, where every card carries its real one. A card that somehow
      // arrives without it is published, and groupCardsByStatus skips those.
      status: c.status ?? 'published',
      // Synthetic placeholder — applyFilters/groupCardsByStatus read tags,
      // date and status, never visibility. SerialisedCard (browse-helpers.ts)
      // doesn't carry visibility across the server->client boundary; the same
      // synthesis appears in resolveFrontPageSlots (frontpage.ts) for the
      // identical reason.
      visibility: { listed: true, reachable: true },
    }))
  );
  const activeFilter: FilterState = $derived($lensFilterStore);
  const cardBackedSet = $derived(cardBackedValues ? new Set(cardBackedValues) : undefined);
  const filteredCards = $derived(applyFilters(cardMetas, activeFilter, cardBackedSet));
  const groups = $derived(groupCardsByStatus(filteredCards));

  // Same anti-FOUC clearing as BrowseLensBrowser.svelte, including why it walks
  // up from this island's own root rather than naming <html> (issue #125).
  let host = $state<HTMLElement | null>(null);
  $effect(() => {
    groups;
    if (pool !== null && $lensFiltersSynced) {
      clearFiltersPending(host);
    }
  });
</script>

{#if pool === null}
  <!-- The same pending/failed placeholder the other two browse-family bodies
       show, `standalone` so it draws itself rather than waiting for a guard
       attribute nothing sets here. -->
  <BrowseSkeleton {failure} standalone onRetry={requestPool} />
{:else}
  <div class="editorial-groups" aria-label="Editorial status groups" bind:this={host}>
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
{/if}

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
