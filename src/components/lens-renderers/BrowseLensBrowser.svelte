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
  import BrowseResults from '../BrowseResults.svelte';

  interface Props {
    cards: SerialisedCardFull[];
    tagDisplay?: Record<string, TagDisplay>;
    config?: Record<string, unknown>;
    /** Card-backed values from the FULL card set — see applyFilters. The pool
     * above is listing-filtered, so this cannot be re-derived from it. */
    cardBackedValues?: string[];
  }

  let { cards, tagDisplay = {}, config, cardBackedValues }: Props = $props();

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

  // Rung 3 of the ranking chain (unseen before seen), for a lens that ranks.
  // Snapshotted once on mount rather than read live: 264 localStorage lookups
  // is not something to redo on every filter keystroke, and a list reshuffling
  // under a reader because they opened a card in another stack entry would be
  // worse than being one navigation stale. Skipped entirely for a lens that
  // doesn't rank (Newest/Oldest sort on date and would pay the cost for
  // nothing).
  let seenSnapshot = $state<Set<string>>(new Set());
  onMount(() => {
    if (isRankingLens(config)) {
      const seen = new Set<string>();
      for (const card of cards) {
        if (getViewState(card.uid, card.contentHash) === 'read') seen.add(card.uid);
      }
      seenSnapshot = seen;
    }
    mounted = true;
  });

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
  const activeFilter: FilterState = $derived(mounted ? $lensFilterStore : { });
  const cardBackedSet = $derived(cardBackedValues ? new Set(cardBackedValues) : undefined);
  const filteredCards = $derived(applyFilters(cardMetas, activeFilter, cardBackedSet));

  // The two runtime rungs of the ranking chain, which is why the browser owns
  // them and browse-helpers only takes them: which values are selected is this
  // lens's business, and seen-ness is the visitor's. Before mount both are
  // inert — `activeFilter` is empty and `seenSnapshot` is empty — so the
  // hydration render reproduces the server's build-time-only ranking exactly.
  // See the anti-FOUC note above: that is also why the swap to the real order
  // happens behind the `data-filters-pending` guard rather than on screen.
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
  // line reports. Both are derived from `activeFilter`, so before mount they
  // describe the unfiltered pool exactly as the server rendered it.
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
  layout={layout}
  terminal={terminal}
  reveal={reveal}
/>
