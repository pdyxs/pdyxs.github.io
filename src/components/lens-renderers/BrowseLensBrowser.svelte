<script lang="ts">
  import { onMount } from 'svelte';
  import { lensFilterStore } from '../../stores/lens-filter-store';
  import {
    applyFilters,
    countSelectedValueMatches,
    filterStateToParams,
    makeMatchContext,
  } from '../../dimensions';
  import type { FilterState } from '../../dimensions';
  import { isRankingLens, sortCardsForBrowse, limitCardsForBrowse } from '../../lib/browse-helpers';
  import type { CardMeta } from '../../lib/cards';
  import { getViewState } from '../../lib/card-view-state';
  import { expandCollapsedSeries } from '../../lib/collapsed-series';
  import { isStripLens, stripTerminal } from '../../lib/strip-lens';
  import { archiveLensId } from '../../lib/lens-registry';
  import { revealSettings } from '../../lib/progressive-reveal';
  import {
    loadCardPool,
    failureReason,
    type CardPoolFailureReason,
  } from '../../lib/card-pool.client';
  import type { SharedCardPoolAsset } from '../../lib/card-pool';
  import BrowseResults from '../BrowseResults.svelte';
  import BrowseSkeleton from '../BrowseSkeleton.svelte';

  interface Props {
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
  // The pending state is ISLAND state, not a CSS guard (#140 decision 2):
  // with nothing server-rendered there is no real DOM to hide, so the
  // skeleton draws itself (`standalone`). The `data-filters-pending` guard
  // this once deferred to is gone entirely (#144) — it existed to hide a
  // server-rendered results grid the client was about to re-sort, and no
  // lens fragment server-renders one any more.
  let pool = $state<SharedCardPoolAsset | null>(null);
  let failure = $state<CardPoolFailureReason | null>(null);

  // Rungs 2 and 4 of the ranking chain (pinned unseen / unseen before seen),
  // for a lens that ranks. Snapshotted once when the pool lands rather than
  // read live: 264 localStorage lookups is not something to redo on every
  // filter keystroke, and a list reshuffling under a reader because they
  // opened a card in another stack entry would be worse than being one
  // navigation stale. Skipped entirely for a lens that doesn't rank
  // (Newest/Oldest sort on date and would pay the cost for nothing).
  //
  // Sourced from `expandCollapsedSeries`'s `readUids`, not a plain per-card
  // getViewState loop: a collapsed representative's own seen-ness is "any
  // member seen" (collapsed-series.ts), which a per-card check on the
  // representative's own uid/hash alone can't express.
  let seenSnapshot = $state<Set<string>>(new Set());

  // One attempt. A failure is dropped by the loader, so calling this again is
  // the whole of the retry contract (see card-pool.client.ts) — which is what
  // the skeleton's retry control does.
  function requestPool() {
    failure = null;
    loadPool()
      .then(asset => {
        // Expand a collapsed series into its "continue reading" entry once any
        // of its chapters has been read (collapsed-series.ts). This has to run
        // before the seen snapshot below: the representative's OWN seen-ness
        // is "any member seen", not just its own hash, and `readUids` is the
        // one place that fact is decided.
        const isRead = (m: { uid: string; contentHash: string }) =>
          getViewState(m.uid, m.contentHash) === 'read';
        const { cards, readUids } = expandCollapsedSeries(asset.cards, asset.seriesMembers, isRead);
        if (isRankingLens(config)) {
          seenSnapshot = readUids;
        }
        // Assigned after the snapshot so the two settle in one render: the
        // grid is never painted in the wrong order and then re-ranked.
        pool = { ...asset, cards };
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
  // order, which is exactly why the `data-filters-pending` guard had nothing
  // left to hide and was removed in #144.
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

</script>

{#if pool === null}
  <!-- `null` is not `[]`: an empty pool would render "no cards match" over a
       request still in flight. `standalone` is what turns the box on — the base
       `.fp-skeleton` rule is `display: none`, and nothing else ever flips it. -->
  <BrowseSkeleton {layout} {failure} standalone onRetry={requestPool} />
{:else}
  <BrowseResults
    cards={sortedCards}
    totalCount={filteredCards.length}
    {tagDisplay}
    filterState={$lensFilterStore}
    layout={layout}
    terminal={terminal}
    reveal={reveal}
  />
{/if}
