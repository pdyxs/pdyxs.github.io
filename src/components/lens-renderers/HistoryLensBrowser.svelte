<script lang="ts">
  import { onMount } from 'svelte';
  import { lensFilterStore, lensFiltersSynced } from '../../stores/lens-filter-store';
  import { applyFilters, countSelectedValueMatches, makeMatchContext } from '../../dimensions';
  import type { FilterState } from '../../dimensions';
  import type { CardMeta } from '../../lib/cards';
  import type { SerialisedCardFull } from '../../lib/frontpage';
  import type { TagDisplay } from '../../lib/tag-display';
  import { getReadAt, hasBeenRead } from '../../lib/card-view-state';
  import {
    historyEmptyMessage,
    historyMode,
    selectHistoryCards,
    type ReadHistory,
  } from '../../lib/history-lens';
  import BrowseResults from '../BrowseResults.svelte';

  interface Props {
    cards: SerialisedCardFull[];
    tagDisplay?: Record<string, TagDisplay>;
    config?: Record<string, unknown>;
    /** Card-backed values from the FULL card set — see applyFilters. */
    cardBackedValues?: string[];
  }

  let { cards, tagDisplay = {}, config, cardBackedValues }: Props = $props();

  // The shared body for both history lenses — Seen and Unseen (issue #84).
  // Which one it is comes from `config.readState`; everything else is the same
  // filter/render path the browse family uses. All the deciding is in
  // src/lib/history-lens.ts, including the ruling on a card that was read and
  // then edited; this component only reads localStorage and renders.
  const mode = $derived(historyMode(config));

  // Two gates, for two different reasons — but both resolve on mount, so one
  // flag carries them:
  //   1. localStorage doesn't exist server-side, so `history` has to be an
  //      empty history until then.
  //   2. The hydration render MUST match the server's, which was prerendered
  //      with the full pool and no filters — see BrowseLensBrowser.svelte for
  //      what mismatching costs (frozen <img> attributes on keyed nodes).
  // An empty history is also the honest server render: to a browser that has
  // never been here, nothing is seen and everything is unseen.
  let mounted = $state(false);
  // Snapshot rather than a live read: taken once on mount, so the list can't
  // reshuffle underneath a visitor while they are looking at it. Reading a
  // card happens in another stack card, and having this lens silently drop the
  // row you just came back from would be worse than being one navigation stale
  // — the next visit to the lens re-reads it.
  let readSnapshot = $state<Record<string, string | null>>({});

  onMount(() => {
    const snapshot: Record<string, string | null> = {};
    for (const card of cards) {
      if (hasBeenRead(card.uid)) snapshot[card.uid] = getReadAt(card.uid);
    }
    readSnapshot = snapshot;
    mounted = true;
  });

  // Keyed on uid alone, both members — see the ruling in history-lens.ts. A
  // `null` value is a card read before #83 added the timestamp: read, at an
  // unknown time, which compareReadAt sorts last.
  const history: ReadHistory = $derived({
    hasRead: uid => uid in readSnapshot,
    readAt: uid => readSnapshot[uid] ?? null,
  });

  // status/visibility don't cross the wire on SerialisedCard, and this pool is
  // already listing-filtered server-side (LensStackCard filters getAllCards()
  // on `.listed` before serialising) — the same synthesis, for the same
  // reason, as BrowseLensBrowser.svelte.
  const cardMetas = $derived(
    cards.map(c => ({
      ...c,
      date: c.date ? new Date(c.date) : undefined,
      status: c.status ?? 'published',
      visibility: { listed: true, reachable: true },
    })) as CardMeta[]
  );

  const activeFilter: FilterState = $derived(mounted ? $lensFilterStore : { });
  const cardBackedSet = $derived(cardBackedValues ? new Set(cardBackedValues) : undefined);
  const filteredCards = $derived(applyFilters(cardMetas, activeFilter, cardBackedSet));

  const matchContext = $derived(makeMatchContext(cardBackedSet ?? new Set<string>()));
  const resultCards = $derived(
    mode
      ? selectHistoryCards<CardMeta>(filteredCards, mode, history, {
          // Rung 1 only. Rung 3 (unseen before seen) can't separate anything
          // here: every card in either result agrees on its read state.
          matchCount: card => countSelectedValueMatches(card, activeFilter, matchContext),
        })
      : filteredCards
  );

  // The empty state's inputs are read from the UNFILTERED pool: "you haven't
  // opened anything yet" and "you have read everything" are claims about the
  // site, and a filter is a different reason to be empty.
  const anyHistory = $derived(cardMetas.some(card => history.hasRead(card.uid)));
  const anyUnread = $derived(cardMetas.some(card => !history.hasRead(card.uid)));
  const emptyMessage = $derived(
    mode ? historyEmptyMessage(mode, { anyHistory, anyUnread }) : undefined
  );

  // Same anti-FOUC clearing as BrowseLensBrowser.svelte.
  $effect(() => {
    resultCards;
    if (mounted && $lensFiltersSynced) {
      document.documentElement.removeAttribute('data-filters-pending');
    }
  });
</script>

<BrowseResults
  cards={resultCards}
  {tagDisplay}
  filterState={activeFilter}
  {emptyMessage}
/>
