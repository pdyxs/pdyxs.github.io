<script lang="ts">
  import { onMount } from 'svelte';
  import { lensFilterStore, lensFiltersSynced } from '../../stores/lens-filter-store';
  import {
    applyFilters,
    countSelectedValueMatches,
    filterStateToParams,
    makeMatchContext,
  } from '../../dimensions';
  import type { FilterState } from '../../dimensions';
  import { isRankingLens, sortCardsForBrowse, limitCardsForBrowse } from '../../lib/browse-helpers';
  import type { CardMeta } from '../../lib/cards';
  import type { SerialisedCardFull } from '../../lib/frontpage';
  import type { TagDisplay } from '../../lib/tag-display';
  import { getViewState } from '../../lib/card-view-state';
  import { isStripLens, stripTerminal } from '../../lib/strip-lens';
  import { archiveLensId } from '../../lib/lens-registry';
  import { revealSettings } from '../../lib/progressive-reveal';
  import { clearFiltersPending } from '../../lib/filters-pending';
  import {
    loadCardPool,
    failureReason,
    type CardPoolFailureReason,
  } from '../../lib/card-pool.client';
  import type { SharedCardPoolAsset } from '../../lib/card-pool';
  import BrowseResults from '../BrowseResults.svelte';
  import BrowseSkeleton from '../BrowseSkeleton.svelte';

  interface Props {
    /**
     * PASSED BUT UNUSED since slice 5 of docs/plans/shared-card-pool.md — the
     * cards, their labels and the card-backed value set all come from
     * `/cards.json` now. They stay declared until slice 8, which is what stops
     * `LensStackCard` passing them: dropping them here first would only make
     * the props it still sends unrecognised.
     */
    cards?: SerialisedCardFull[];
    tagDisplay?: Record<string, TagDisplay>;
    cardBackedValues?: string[];
    config?: Record<string, unknown>;
    /**
     * The pool source, injected so a test can drive this island against a fake
     * one — the same seam `createCardFragments({ load })` is for the stack.
     * Production never passes it.
     */
    loadPool?: () => Promise<SharedCardPoolAsset>;
  }

  let { config, loadPool = loadCardPool }: Props = $props();

  // The generic body for any filter-accepting lens with no bespoke rendering
  // (the "browse lens family" — see lens-registry.ts). Filtering is derived
  // from the shared lensFilterStore (owned by LensFilterShell.svelte, a
  // sibling island) rather than owned locally — applyFilters is pure and
  // cheap, so re-deriving here is not a second copy of STATE, just a
  // computation from the single source of truth.
  //
  // THE CARDS COME FROM THE SHARED POOL (slice 5 of
  // docs/plans/shared-card-pool.md, #150), not from a prop. Two consequences,
  // and the first one deletes a hazard rather than adding one:
  //
  //  - There is no server-rendered grid any more, so there is no SSR render to
  //    reproduce on hydration. The long-standing `mounted` flag whose first job
  //    was to make the hydration render match the server's full-pool DOM — the
  //    frozen-<img> bug — has nothing left to guard: the server renders the
  //    skeleton, and so does the client's first render. What survives it is the
  //    seenSnapshot below, which now settles beside the pool's arrival.
  //  - `null` is not `[]` (the #133 rule). An empty array here would render
  //    "No cards match the current filters" over a request still in flight, so
  //    the pending state is its own branch of the template.
  //
  // The pending state is ISLAND state, not a fourth CSS guard (#140 decision
  // 2): with nothing server-rendered there is no real DOM to hide, so the
  // skeleton draws itself (`standalone`) rather than waiting for
  // `data-filters-pending`.
  let pool = $state<SharedCardPoolAsset | null>(null);
  let failure = $state<CardPoolFailureReason | null>(null);

  // Rung 3 of the ranking chain (unseen before seen), for a lens that ranks.
  // Snapshotted once when the pool lands rather than read live: 264
  // localStorage lookups is not something to redo on every filter keystroke,
  // and a list reshuffling under a reader because they opened a card in
  // another stack entry would be worse than being one navigation stale.
  // Skipped entirely for a lens that doesn't rank (Newest/Oldest sort on date
  // and would pay the cost for nothing).
  let seenSnapshot = $state<Set<string>>(new Set());

  // One attempt. A failure is dropped by the loader, so calling this again is
  // the whole of the retry contract (see card-pool.client.ts) — which is what
  // the skeleton's retry control does.
  function requestPool() {
    failure = null;
    loadPool()
      .then(asset => {
        if (isRankingLens(config)) {
          const seen = new Set<string>();
          for (const card of asset.cards) {
            if (getViewState(card.uid, card.contentHash) === 'read') seen.add(card.uid);
          }
          seenSnapshot = seen;
        }
        // Assigned after the snapshot so the two settle in one render: the
        // grid is never painted in the wrong order and then re-ranked.
        pool = asset;
      })
      .catch(error => {
        failure = failureReason(error);
      });
  }

  // onMount, not module scope: the fetch is a client-only effect, and the
  // island server-renders too.
  onMount(requestPool);

  const cards = $derived(pool?.cards ?? []);
  const tagDisplay = $derived(pool?.tagDisplay ?? {});
  const cardBackedValues = $derived(pool?.cardBackedValues);

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
  const activeFilter: FilterState = $derived($lensFilterStore);
  const cardBackedSet = $derived(cardBackedValues ? new Set(cardBackedValues) : undefined);
  const filteredCards = $derived(applyFilters(cardMetas, activeFilter, cardBackedSet));

  // The two runtime rungs of the ranking chain, which is why the browser owns
  // them and browse-helpers only takes them: which values are selected is this
  // lens's business, and seen-ness is the visitor's. Both are known by the time
  // anything is rendered now — the grid's first paint is already the real
  // order, which is what the `data-filters-pending` guard used to have to cover
  // for. (The guard stays for now regardless; see #144.)
  const matchContext = $derived(makeMatchContext(cardBackedSet ?? new Set<string>()));
  const rankingCtx = $derived({
    matchCount: (card: CardMeta) => countSelectedValueMatches(card, activeFilter, matchContext),
    isSeen: (card: CardMeta) => seenSnapshot.has(card.uid),
  });

  const sortedCards = $derived(
    limitCardsForBrowse(sortCardsForBrowse(filteredCards, config, rankingCtx), config),
  );

  // Progressive reveal, for the grid layout only (BrowseResults ignores it on a
  // strip). Decided from the lens config here so the results component stays a
  // pure applier.
  const reveal = $derived(revealSettings(config));

  // A capped timeline lens (Newest/Oldest) lays its results out as a strip and
  // closes the run with a tile to the archive. The count the tile states is the
  // full match, not the capped run — filteredCards, the same value the count
  // line reports. `layout` is decided from the lens config alone, so the
  // pending skeleton already knows which shape it is standing in for.
  const layout = $derived(isStripLens(config) ? 'strip' : 'grid');
  const terminal = $derived(
    layout === 'strip'
      ? stripTerminal(
          filteredCards.length,
          sortedCards.length,
          filterStateToParams(activeFilter).toString(),
          archiveLensId(),
        )
      : null,
  );

  // Clear the anti-FOUC guard once this island has mounted (so sortedCards now
  // reflects the store, not the SSR-matching full set) AND the shell has synced
  // the selection. Reading sortedCards makes the effect re-run when the reduced
  // set lands, so we never reveal before the DOM reflects it.
  //
  // Cleared by walking UP from this island's own results root, never by naming
  // <html> (issue #125). There are two hosts — <html> for a cold load, the
  // incoming `.stack-card` for a client-side lens transition — and `closest()`
  // finds whichever is covering THIS island. It also finds nothing for an
  // island sitting in some other card of the stack, which is the point: a
  // second browse lens behind the active one re-runs this effect every time
  // the shared filter store moves, and naming <html> made it reveal the
  // incoming card mid-re-sort. A load with no guard set at all no-ops.
  let host = $state<HTMLElement | null>(null);
  $effect(() => {
    sortedCards;
    if (pool !== null && $lensFiltersSynced) {
      clearFiltersPending(host);
    }
  });
</script>

{#if pool === null}
  <!-- `null` is not `[]`: an empty pool would render "no cards match" over a
       request still in flight. `standalone` is what turns the box on — the base
       `.fp-skeleton` rule is `display: none` and only the guard ever flipped
       it, and the guard is not set on an unfiltered cold load. -->
  <BrowseSkeleton {layout} {failure} standalone onRetry={requestPool} />
{:else}
  <BrowseResults
    bind:host
    cards={sortedCards}
    totalCount={filteredCards.length}
    {tagDisplay}
    filterState={$lensFilterStore}
    layout={layout}
    terminal={terminal}
    reveal={reveal}
  />
{/if}
