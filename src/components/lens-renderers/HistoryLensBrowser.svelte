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
     * PASSED BUT UNUSED since slice 5 of docs/plans/shared-card-pool.md — they
     * come from `/cards.json` now, and stay declared until slice 8 stops
     * `LensStackCard` passing them.
     */
    cards?: SerialisedCardFull[];
    tagDisplay?: Record<string, TagDisplay>;
    cardBackedValues?: string[];
    config?: Record<string, unknown>;
    /** The pool source, injected so a test can drive this island against a
     * fake one. Production never passes it. */
    loadPool?: () => Promise<SharedCardPoolAsset>;
  }

  let { config, loadPool = loadCardPool }: Props = $props();

  // The shared body for both history lenses — Seen and Unseen (issue #84).
  // Which one it is comes from `config.readState`; everything else is the same
  // filter/render path the browse family uses. All the deciding is in
  // src/lib/history-lens.ts, including the ruling on a card that was read and
  // then edited; this component only reads localStorage and renders.
  const mode = $derived(historyMode(config));

  // ONE settling moment now, where there used to be two gates on one `mounted`
  // flag (slice 5 of docs/plans/shared-card-pool.md, #150). The cards come from
  // the shared pool rather than a prop, so:
  //
  //  - There is no server-rendered grid to reproduce on hydration, which is
  //    what the flag's second job was (see BrowseLensBrowser.svelte for what
  //    mismatching cost: frozen <img> attributes on keyed nodes).
  //  - localStorage still doesn't exist server-side, and the read snapshot is
  //    taken over the pool's cards — so it settles WITH the pool, in the same
  //    render, rather than against an already-painted grid.
  //
  // `null` is not `[]` (#133): an empty pool would render "you haven't opened
  // anything yet" over a request still in flight, which is the one lie this
  // lens must not tell. An empty history, once the pool HAS landed, remains
  // both honest and common — see historyEmptyMessage.
  let pool = $state<SharedCardPoolAsset | null>(null);
  let failure = $state<CardPoolFailureReason | null>(null);
  // Snapshot rather than a live read: taken once when the pool lands, so the
  // list can't reshuffle underneath a visitor while they are looking at it.
  // Reading a card happens in another stack card, and having this lens
  // silently drop the row you just came back from would be worse than being
  // one navigation stale — the next visit to the lens re-reads it.
  let readSnapshot = $state<Record<string, string | null>>({});

  // One attempt; calling it again is the whole of the retry contract (a failed
  // load is dropped by the loader — see card-pool.client.ts).
  function requestPool() {
    failure = null;
    loadPool()
      .then(asset => {
        const snapshot: Record<string, string | null> = {};
        for (const card of asset.cards) {
          if (hasBeenRead(card.uid)) snapshot[card.uid] = getReadAt(card.uid);
        }
        readSnapshot = snapshot;
        // After the snapshot, so membership and the pool land in one render.
        pool = asset;
      })
      .catch(error => {
        failure = failureReason(error);
      });
  }

  onMount(requestPool);

  const cards = $derived(pool?.cards ?? []);
  const tagDisplay = $derived(pool?.tagDisplay ?? {});
  const cardBackedValues = $derived(pool?.cardBackedValues);

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

  const activeFilter: FilterState = $derived($lensFilterStore);
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

  // Progressive reveal (issue #81). Unseen is uncapped and starts out as very
  // nearly the whole site, so it wants the same pacing the archive lens gets —
  // "will apply to every grid lens at once", as unseen.lens.yaml put it.
  const reveal = $derived(revealSettings(config));

  // Same anti-FOUC clearing as BrowseLensBrowser.svelte, including why it walks
  // up from `host` rather than naming <html> (issue #125).
  let host = $state<HTMLElement | null>(null);
  $effect(() => {
    resultCards;
    if (pool !== null && $lensFiltersSynced) {
      clearFiltersPending(host);
    }
  });
</script>

{#if pool === null}
  <!-- `null` is not `[]` — see the note above. The skeleton draws itself
       (`standalone`); the CSS guard is not set on an unfiltered cold load and
       could not turn it on. -->
  <BrowseSkeleton {failure} standalone onRetry={requestPool} />
{:else}
  <BrowseResults
    bind:host
    cards={resultCards}
    {tagDisplay}
    filterState={activeFilter}
    {emptyMessage}
    {reveal}
  />
{/if}
