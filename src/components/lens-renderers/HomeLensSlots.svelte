<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { resolveFrontPageSlots, buildBrowseUrl } from '../../lib/frontpage';
  import type { FrontPageConfig, ResolvedSlot, SerialisedCardFull } from '../../lib/frontpage';
  import type { TagDisplay } from '../../lib/tag-display';
  import { lensFilterStore } from '../../stores/lens-filter-store';
  import { applyFilters } from '../../dimensions';
  import { BROWSE_CARD_VARIANTS } from '../../lib/browse-card-variants';
  import BrowseCard from '../BrowseCard.svelte';

  interface Props {
    config: FrontPageConfig;
    cards: SerialisedCardFull[];
    /** Flat value -> display-name map, for the cards' tag chips. */
    tagDisplay?: Record<string, TagDisplay>;
    /**
     * Card-backed values from the FULL card set — see applyFilters.
     *
     * Declared, and that is the point (issue #135): the props block used to
     * list `cards` and `config` only, so the array LensStackCard has always
     * passed was silently dropped and selectSlotCard fell back to
     * `cardOwnValues` over the listing-filtered pool — the exact failure
     * LensStackCard's own comment warns about ("a draft/unlisted target would
     * drop out and every post tagged with it would prefix-match into that
     * card's parent category"). Probably inert given home's coarse `what:*`
     * filters; it must not survive silently either way. Under #136 this prop
     * plumbing largely disappears and this goes with it.
     */
    cardBackedValues?: string[];
  }

  let { config, cards, tagDisplay = {}, cardBackedValues }: Props = $props();

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
   */
  let resolvedSlots = $state<ResolvedSlot[] | null>(null);

  /**
   * The safety net, not a partial reveal. Home has no prerendered card set, so
   * a grid of empty frames that never fills is a persistent lie rather than a
   * flash — the placeholder interiors are swapped for a short message instead.
   */
  let stalled = $state(false);
  const STALL_MS = 3000;

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
      resolved: resolvedSlots !== null,
    })),
  );

  onMount(() => {
    const timer = setTimeout(() => {
      if (resolvedSlots === null) stalled = true;
    }, STALL_MS);

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
    const backed = cardBackedValues ? new Set(cardBackedValues) : undefined;
    const filtered = applyFilters(cardMetas, get(lensFilterStore), backed);
    const serialisedFiltered = filtered.map(c => ({ ...c, date: c.date?.toISOString() ?? null }));

    const { slots } = resolveFrontPageSlots(config, serialisedFiltered, new Date(), backed);
    resolvedSlots = slots;

    return () => clearTimeout(timer);
  });
</script>

<!-- The real grid, server-rendered from home.lens.yaml alone. This is NOT a
     skeleton and there is no layer to remove: the cells are the finished ones
     and only their interiors are provisional, so the grid never moves — it
     fills. (Which is the tell that it is the right shape.) -->
<div class="fp-slot-grid">
  {#each cells as { slot, variant, seeMoreUrl, card, resolved }, i (i)}
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
        {#if card}
          <ul class="fp-slot-card-list">
            <BrowseCard {card} {tagDisplay} variant={slot.variant} />
          </ul>
        {/if}
      {:else if stalled}
        <p class="fp-slot-stalled">
          Nothing loaded here — something stopped this page finishing.
          Reloading usually fixes it.
        </p>
      {:else}
        <!-- The interior is PINNED, not guessed: --browse-card-min-height is
             the variant's measured floor, the same number BrowseCard's own
             content box carries, so the real card can only grow into space
             already held. A guessed height would set every row's height at
             first paint and the real cards would change it at hydration — a
             document-height jump on `/`, which is the whole thing this
             exists to prevent. -->
        <div
          class="fp-slot-placeholder"
          style:--browse-card-min-height={variant.minHeight}
          aria-hidden="true"
        >
          {#if variant.thumb}
            <div class="fp-slot-placeholder-thumb"></div>
          {/if}
          <div class="fp-slot-placeholder-content">
            <div class="fp-slot-placeholder-line fp-slot-placeholder-line--title"></div>
            <div class="fp-slot-placeholder-line"></div>
            <div class="fp-slot-placeholder-line fp-slot-placeholder-line--short"></div>
          </div>
        </div>
      {/if}

      {#if seeMoreUrl}
        <a class="fp-see-more" href={seeMoreUrl}>See more →</a>
      {/if}
    </div>
  {/each}
</div>

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
