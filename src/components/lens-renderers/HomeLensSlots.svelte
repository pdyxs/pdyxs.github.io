<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { resolveFrontPageSlots, buildBrowseUrl } from '../../lib/frontpage';
  import type { FrontPageConfig, ResolvedSlot } from '../../lib/frontpage';
  import type { TagDisplay } from '../../lib/tag-display';
  import { lensFilterStore } from '../../stores/lens-filter-store';
  import { applyFilters } from '../../dimensions';
  import { BROWSE_CARD_VARIANTS } from '../../lib/browse-card-variants';
  import { poolFailureMessage } from '../../lib/browse-skeleton';
  import {
    loadCardPool,
    failureReason,
    type CardPoolFailureReason,
  } from '../../lib/card-pool.client';
  import type { SharedCardPoolAsset } from '../../lib/card-pool';
  import BrowseCard from '../BrowseCard.svelte';

  interface Props {
    config: FrontPageConfig;
    /**
     * The pool source, injected so a test can drive this island against a fake
     * one — the same seam `createCardFragments({ load })` is for the stack.
     * Production never passes it.
     */
    loadPool?: () => Promise<SharedCardPoolAsset>;
  }

  let { config, loadPool = loadCardPool }: Props = $props();

  /**
   * All-or-nothing (issue #133). `null` is not `[]`: the empty array is what an
   * empty config resolves to, while `null` is "the pool hasn't arrived". A
   * filter slot resolving with `card: null` draws chrome and no interior
   * PERMANENTLY, and reads correctly precisely because the page around it has
   * filled — so the placeholder keys on this whole-page state and never on an
   * individual slot's card being absent.
   *
   * No mechanism is needed to make it all-or-nothing: resolveFrontPageSlots is
   * synchronous and returns the whole array in one assignment, so every slot
   * lands in the same tick by construction.
   *
   * Slice 6 of docs/plans/shared-card-pool.md changed WHEN this is assigned and
   * nothing else. #140: home needs no new states — the pool arriving over the
   * network rather than from a prop is a timing change, and #133 already built
   * the page around the pool being absent for a while.
   */
  let resolvedSlots = $state<ResolvedSlot[] | null>(null);

  /** The pool's labels, for the cards' tag chips. Lands with the slots. */
  let tagDisplay = $state<Record<string, TagDisplay>>({});

  /**
   * The failure, not a stall. This replaces the local `STALL_MS = 3000` timer:
   * that number was sized against `onMount` work, so against a network round
   * trip it gave up while the fetch was still in flight. The timeout now lives
   * with the fetch it is about — `POOL_TIMEOUT_MS`, the one shared number
   * (#140) — and reaches here as an ordinary failure reason, which is also what
   * makes the retry below possible: a stall had nothing to retry.
   */
  let failure = $state<CardPoolFailureReason | null>(null);

  /**
   * The grid is rendered from the config alone — real spans, real rows, real
   * labels, real "See more →" — so what a slot needs before the pool arrives
   * is its layout, which the config already carries. Deriving it from
   * `resolvedSlots` would make the grid itself wait.
   */
  const cells = $derived(
    config.slots.map((slot, i) => ({
      slot,
      variant: BROWSE_CARD_VARIANTS[slot.variant],
      // Chrome, from the config alone. `ResolvedSlot.seeMoreUrl` is the same
      // string (both go through buildBrowseUrl) — it is on the resolved slot
      // for consumers that only hold one, while the grid, which holds the
      // config, must be able to draw the link before the pool arrives.
      seeMoreUrl: slot.seeMore && slot.filter ? buildBrowseUrl(slot.filter) : null,
      card: resolvedSlots?.[i]?.card ?? null,
      // Undefined (not null) when the slot declared no `stackUid:` — that's
      // what keeps the second card list out of the DOM entirely for every
      // ordinary slot, rather than rendering an empty one.
      hasStack: slot.stackUid !== undefined,
      stackCard: resolvedSlots?.[i]?.stackCard ?? null,
      resolved: resolvedSlots !== null,
    })),
  );

  function resolveFromPool(pool: SharedCardPoolAsset): ResolvedSlot[] {
    // Home is acceptsFilters:false (see lens-registry.ts) — toggling a filter
    // while Home is active falls through to the default browse lens instead
    // of accumulating a selection here, so this is always empty in practice.
    // Applying it anyway keeps the filtering contract uniform across every
    // lens body and stays correct if that ever changes — "further filtering
    // on top of the shared narrowed set" is exactly what Home's day-seeded
    // slot curation already does. Read with `get()` rather than subscribed to,
    // as it was before the pool: the slots settle once, on arrival.
    // status/visibility don't cross the wire on SerialisedCard, and the pool
    // is already listing-filtered server-side (buildCardPool filters on
    // `.listed` before serialising), so synthesising the published/visible
    // defaults is accurate — the same reasoning, and the same values, as
    // resolveFrontPageSlots applies to this pool a few lines below.
    const cardMetas = pool.cards.map(c => ({
      ...c,
      date: c.date ? new Date(c.date) : undefined,
      status: 'published' as const,
      visibility: { listed: true, reachable: true },
    }));
    const backed = new Set(pool.cardBackedValues);
    const filtered = applyFilters(cardMetas, get(lensFilterStore), backed);
    const serialisedFiltered = filtered.map(c => ({ ...c, date: c.date?.toISOString() ?? null }));

    return resolveFrontPageSlots(config, serialisedFiltered, new Date(), backed).slots;
  }

  // One attempt. A failure is dropped by the loader, so calling this again is
  // the whole of the retry contract (see card-pool.client.ts) — which is what
  // the retry control below does.
  function requestPool() {
    failure = null;
    loadPool()
      .then(pool => {
        // The labels are assigned first so the two settle in one render: a
        // card is never painted with humanised chips and then corrected.
        tagDisplay = pool.tagDisplay;
        resolvedSlots = resolveFromPool(pool);
      })
      .catch(error => {
        failure = failureReason(error);
      });
  }

  // onMount, not module scope: the fetch is a client-only effect, and the
  // island server-renders too.
  onMount(requestPool);
</script>

<!-- The interior is PINNED, not guessed: --browse-card-min-height is the
     variant's measured floor, the same number BrowseCard's own content box
     carries, so the real card can only grow into space already held. A
     guessed height would set every row's height at first paint and the real
     card would change it at hydration — a document-height jump on `/`, which
     is the whole thing this exists to prevent. Shared by the primary and
     stacked placeholders so a `stackUid:` slot reserves space for both cards
     rather than only the first. -->
{#snippet placeholder(v: (typeof BROWSE_CARD_VARIANTS)[keyof typeof BROWSE_CARD_VARIANTS])}
  <div class="fp-slot-placeholder" style:--browse-card-min-height={v.minHeight} aria-hidden="true">
    {#if v.thumb}
      <div class="fp-slot-placeholder-thumb"></div>
    {/if}
    <div class="fp-slot-placeholder-content">
      <div class="fp-slot-placeholder-line fp-slot-placeholder-line--title"></div>
      <div class="fp-slot-placeholder-line"></div>
      <div class="fp-slot-placeholder-line fp-slot-placeholder-line--short"></div>
    </div>
  </div>
{/snippet}

<!-- The real grid, server-rendered from home.lens.yaml alone. This is NOT a
     skeleton and there is no layer to remove: the cells are the finished ones
     and only their interiors are provisional, so the grid never moves — it
     fills. (Which is the tell that it is the right shape.) -->
<div class="fp-slot-grid">
  {#each cells as { slot, variant, seeMoreUrl, card, hasStack, stackCard, resolved }, i (i)}
    <!-- Keyed by index: today's `type === 'pinned' ? uid : label` cannot
         survive optional labels, and this list is server-resolved and static. -->
    <div
      class="fp-slot"
      class:fp-slot--rail={slot.side === 'right'}
      style:--slot-span-small={slot.span.small}
      style:--slot-span-large={slot.span.large}
      style:--slot-rows-small={slot.rows.small}
      style:--slot-rows-large={slot.rows.large}
    >
      {#if slot.label}
        <p class="fp-slot-label">{slot.label}</p>
      {/if}

      {#if resolved}
        {#if hasStack}
          <!-- Both cards live in ONE wrapper inside this single grid cell,
               never as a second grid item — a `stackUid:` slot needs its
               second card to follow the first with no gap, regardless of how
               tall the row-track this slot's cell happens to share with other
               slots ends up being. Two grid items can't do that: each
               stretches to fill its own row-track independently, and any
               slack in a shared track lands wherever THAT item's flex
               alignment puts it, not next to a sibling in a different track.
               `.fp-slot-stack` also carries the small-tier row split that
               reproduces the two cards sitting side by side, which is why the
               wrapper exists even when one side hasn't resolved a card. See
               CLAUDE.md's home-slots section. -->
          <div
            class="fp-slot-stack"
            style:--stack-direction-small={slot.stackDirection?.small}
            style:--stack-direction-large={slot.stackDirection?.large}
            style:--stack-split={slot.stackSplit}
          >
            {#if card}
              <ul class="fp-slot-card-list">
                <BrowseCard {card} {tagDisplay} variant={slot.variant} />
              </ul>
            {/if}
            {#if stackCard}
              <ul class="fp-slot-card-list">
                <BrowseCard card={stackCard} {tagDisplay} variant={slot.variant} />
              </ul>
            {/if}
          </div>
        {:else if card}
          <ul class="fp-slot-card-list">
            <BrowseCard {card} {tagDisplay} variant={slot.variant} />
          </ul>
        {/if}
      {:else if failure !== null}
        <!-- The safety net, not a partial reveal. Home has no prerendered card
             set, so a grid of empty frames that never fills is a persistent lie
             rather than a flash — the placeholder interiors are swapped for an
             honest message instead. It says only what the loader knows
             (poolFailureMessage, the same decision the browse skeleton renders);
             what can be DONE about it is the one retry control below the grid,
             rather than one per slot saying the same thing five times. -->
        <p class="fp-slot-stalled">{poolFailureMessage(failure)}</p>
      {:else if hasStack}
        <div
          class="fp-slot-stack"
          style:--stack-direction-small={slot.stackDirection?.small}
          style:--stack-direction-large={slot.stackDirection?.large}
          style:--stack-split={slot.stackSplit}
        >
          {@render placeholder(variant)}
          {@render placeholder(variant)}
        </div>
      {:else}
        {@render placeholder(variant)}
      {/if}

      {#if seeMoreUrl}
        <a class="fp-see-more" href={seeMoreUrl}>See more →</a>
      {/if}
    </div>
  {/each}
</div>

{#if failure !== null}
  <!-- One control for the whole page, because one fetch failed for the whole
       page. `.fp-pool-retry` is shared with the browse skeleton (slice 6 of
       docs/plans/shared-card-pool.md names both surfaces) and does the same
       thing: loadCardPool() drops a failed attempt, so calling it again starts
       a fresh one. -->
  <button type="button" class="fp-pool-retry" onclick={requestPool}>Try again</button>
{/if}

<style>
  /* .fp-slot-grid, .fp-slot, .fp-slot--rail, .fp-slot-label and .fp-see-more
     live in global.css: they render inside the home lens FRAGMENT, and a
     scoped rule does not exist on whatever page a fragment lands in (#131).
     What stays here is the placeholder, which exists only between mount and
     the pool arriving. */

  /* Static dither, no animation — the palette has no grey to shimmer in,
     softening a colour with `opacity` is a bug, and a moving gradient over the
     fixed dither grid is exactly the re-rasterisation that grid exists to
     prevent. */
  .fp-slot-placeholder {
    border: var(--border-width) solid var(--color-border);
    background: var(--color-surface);
    overflow: hidden;
  }

  .fp-slot-placeholder-thumb {
    aspect-ratio: 16 / 9;
    background: var(--dither-3);
  }

  /* The floor the real card's own .browse-card-content carries, so the swap
     costs no height. */
  .fp-slot-placeholder-content {
    padding: var(--space-md);
    box-sizing: border-box;
    min-height: var(--browse-card-min-height);
  }

  .fp-slot-placeholder-line {
    height: 0.7rem;
    margin-bottom: var(--space-xs);
    background: var(--dither-4);
  }

  .fp-slot-placeholder-line--title {
    height: 1rem;
    width: 70%;
    background: var(--dither-6);
  }

  .fp-slot-placeholder-line--short {
    width: 45%;
  }

  /* Varied line lengths decided by POSITION, never at random: these nodes are
     server-rendered and hydration-adopted, so anything non-deterministic would
     differ between the two renders. */
  .fp-slot:nth-child(2n) .fp-slot-placeholder-line--title { width: 55%; }
  .fp-slot:nth-child(3n) .fp-slot-placeholder-line--title { width: 82%; }
  .fp-slot:nth-child(2n) .fp-slot-placeholder-line--short { width: 62%; }

  .fp-slot-stalled {
    font-family: var(--font-ui);
    font-size: 0.85rem;
    color: var(--color-text-muted);
    margin: 0;
    max-width: 44ch;
  }

  /* An ordinary flat control: paper at rest, the L2 dither on hover, per the
     selected/flat surface table in CLAUDE.md. The same rule BrowseSkeleton
     carries for the same class — duplicated rather than shared because a
     .svelte component's styles ship with its own island (the islands exception
     to "anything in a fragment is styled in global.css"), and these two islands
     are never both on screen. */
  .fp-pool-retry {
    font-family: var(--font-ui);
    font-size: 0.9rem;
    color: var(--color-text);
    background: var(--color-bg);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-sm);
    padding: var(--space-sm) var(--space-lg);
    margin-top: var(--space-md);
    cursor: pointer;
  }

  .fp-pool-retry:hover {
    background: var(--color-bg-hover);
  }

  /* The list wrapper exists only because BrowseCard renders an <li>. The
     card's own bottom margin (global.css's `li { margin-bottom: var(--space-xs) }`,
     which BrowseCard doesn't reset) is taken back here: the placeholder it
     replaces has none, and a slot that grew by it at hydration would be the
     document-height change this whole arrangement exists to avoid. */
  .fp-slot-card-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .fp-slot-card-list :global(> li) {
    margin-bottom: 0;
  }
</style>
