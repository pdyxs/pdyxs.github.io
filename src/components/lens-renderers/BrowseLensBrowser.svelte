<script lang="ts">
  import { onMount } from 'svelte';
  import { lensFilterStore, lensFiltersSynced } from '../../stores/lens-filter-store';
  import { applyFilters } from '../../lib/filters';
  import type { FilterState } from '../../lib/filters';
  import { sortCardsForBrowse, limitCardsForBrowse } from '../../lib/browse-helpers';
  import type { SerialisedCardFull } from '../../lib/frontpage';
  import type { TagDisplay } from '../../lib/tag-display';
  import BrowseResults from '../BrowseResults.svelte';

  interface Props {
    cards: SerialisedCardFull[];
    tagDisplay?: Record<string, TagDisplay>;
    config?: Record<string, unknown>;
  }

  let { cards, tagDisplay = {}, config }: Props = $props();

  // The generic body for any filter-accepting lens with no bespoke rendering
  // (the "browse lens family" — see lens-registry.ts). Filtering is derived
  // from the shared lensFilterStore (owned by LensFilterShell.svelte, a
  // sibling island) rather than owned locally — applyFilters is pure and
  // cheap, so re-deriving here is not a second copy of STATE, just a
  // computation from the single source of truth.
  // The client's first (hydration) render MUST match the server's, which was
  // statically prerendered with the FULL card set (the build has no query
  // string). This body and LensFilterShell are separate client:load islands
  // sharing lensFilterStore, and they hydrate in a nondeterministic order. If
  // the shell's onMount syncs the URL filter into the store *before* this island
  // renders, reading the store here would produce the reduced set against the
  // full-set SSR DOM. Svelte's keyed {#each} then mis-pairs nodes and — because
  // it keeps the *server* value for any attribute that mismatches on hydration —
  // freezes each card's <img> to whatever card occupied that DOM slot in the
  // unfiltered set while the text updates to the filtered card. (That is the
  // "wrong images after a filtered refresh" bug.) So we defer reading the store
  // until after mount; until then we derive from the empty filter state, exactly
  // reproducing SSR. Post-mount the store drives a normal reconcile, which
  // updates src/srcset correctly (the freeze is hydration-only).
  let mounted = $state(false);
  onMount(() => { mounted = true; });

  // status/visibility don't cross the serialisation boundary on the
  // SerialisedCard type by default (see browse-helpers.ts); this pool is
  // already listing-filtered (LensStackCard filters getAllCards() on
  // `.listed` before serialising), so a card with no `status` here is
  // published, and it's always listed/reachable — see CardMeta's defaults.
  // The dev-only status facet (issue #52) narrows by the real `status` when
  // it IS present (dev bypasses the listing filter, so drafts etc. do reach
  // this pool with their true status).
  const cardMetas = $derived(
    cards.map(c => ({
      ...c,
      date: c.date ? new Date(c.date) : undefined,
      status: c.status ?? 'published',
      visibility: { listed: true, reachable: true },
    }))
  );
  const activeFilter: FilterState = $derived(mounted ? $lensFilterStore : { selections: {} });
  const filteredCards = $derived(applyFilters(cardMetas, activeFilter));
  const sortedCards = $derived(limitCardsForBrowse(sortCardsForBrowse(filteredCards, config), config));

  // Clear the pre-paint anti-FOUC guard (set by Base.astro's inline script when
  // the URL carries filters) once this island has mounted (so sortedCards now
  // reflects the store, not the SSR-matching full set) AND the shell has synced
  // the selection. Reading sortedCards makes the effect re-run when the reduced
  // set lands, so we never reveal before the DOM reflects it. The guard is on
  // <html>, so a bare-cold no-filter load (guard never set) no-ops.
  $effect(() => {
    sortedCards;
    if (mounted && $lensFiltersSynced) {
      document.documentElement.removeAttribute('data-filters-pending');
    }
  });
</script>

<BrowseResults
  cards={sortedCards}
  totalCount={filteredCards.length}
  {tagDisplay}
  filterState={$lensFilterStore}
/>
