<script lang="ts">
  import { onMount } from 'svelte';
  import { selectSlotCard } from '../lib/slot-selection';
  import { markDisplayed } from '../lib/card-view-state';
  import { buildBrowseUrl } from '../lib/frontpage';
  import type { FrontPageConfig } from '../lib/frontpage';

  // Full card shape including contentHash (CardMeta spread + date serialised)
  type SerialisedCardFull = {
    uid: string;
    collection: string;
    id: string;
    title: string;
    description?: string;
    date: string | null;
    tags: string[];
    renderer: string;
    contentHash: string;
  };

  interface Props {
    config: FrontPageConfig;
    cards: SerialisedCardFull[];
  }

  let { config, cards }: Props = $props();

  // Hydrate dates so slot-selection date predicates work
  const cardMetas = $derived(
    cards.map(c => ({
      ...c,
      date: c.date ? new Date(c.date) : undefined,
    }))
  );

  // ── Resolved slots ─────────────────────────────────────────────────────────

  type ResolvedPinned = {
    type: 'pinned';
    uid: string;
    title: string;
    titleSuffix?: string;
    description?: string;
  };

  type ResolvedFilter = {
    type: 'filter';
    label: string;
    card: SerialisedCardFull | null;
    browseUrl: string;
  };

  type ResolvedSlot = ResolvedPinned | ResolvedFilter;

  let resolvedSlots = $state<ResolvedSlot[]>([]);

  onMount(() => {
    const now = new Date();
    const byUid = new Map(cards.map(c => [c.uid, c]));

    const resolved: ResolvedSlot[] = [];

    for (const slot of config.slots) {
      if (slot.type === 'pinned') {
        const card = byUid.get(slot.uid);
        if (card) {
          resolved.push({
            type: 'pinned',
            uid: card.uid,
            title: card.title,
            description: card.description,
          });
        }
      } else {
        const meta = selectSlotCard(cardMetas, slot.filter, now);
        if (meta) {
          markDisplayed(meta.uid, meta.contentHash);
        }
        const card = meta ? byUid.get(meta.uid) ?? null : null;
        resolved.push({
          type: 'filter',
          label: slot.label,
          card,
          browseUrl: buildBrowseUrl(slot.filter),
        });
      }
    }

    resolvedSlots = resolved;
  });
</script>

<div class="front-page-slots">
  {#each resolvedSlots as slot (slot.type === 'pinned' ? slot.uid : slot.label)}
    {#if slot.type === 'pinned'}
      <div class="card-link fp-pinned" data-push-card={slot.uid}>
        <div class="card-header">
          <span class="card-header-title"><b>{slot.title}</b></span>
        </div>
      </div>
    {:else}
      <div class="fp-filter-slot">
        <p class="fp-slot-label">{slot.label}</p>
        {#if slot.card}
          <div
            class="card-link fp-slot-card"
            data-push-card={slot.card.uid}
            role="button"
            tabindex="0"
          >
            <div class="card-header">
              <span class="card-header-title"><b>{slot.card.title}</b></span>
            </div>
            {#if slot.card.description}
              <p class="fp-slot-description">{slot.card.description}</p>
            {/if}
          </div>
        {/if}
        <a class="fp-see-more" href={slot.browseUrl}>See more →</a>
      </div>
    {/if}
  {/each}
</div>

<style>
  .front-page-slots {
    display: flex;
    flex-direction: column;
    gap: 0;
    border: var(--border-width) solid var(--color-border);
  }

  /* separator lines between all slots */
  .front-page-slots > :not(:first-child) {
    border-top: var(--border-width) solid var(--color-border);
  }

  /* ── Pinned card link ── */

  .fp-pinned {
    cursor: pointer;
  }

  /* ── Card header (replicates CardHeader.astro styles) ── */

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-lg);
    font-family: var(--font-heading);
    font-size: 1.1rem;
    font-weight: 400;
    letter-spacing: 0.04em;
    color: var(--color-text);
    background: repeating-linear-gradient(
      to bottom,
      transparent 0px,
      transparent 18px,
      var(--color-bg-stripes) 19px,
      var(--color-bg-stripes) 20px
    );
    user-select: none;
  }

  .card-header-title {
    background: var(--color-surface);
    padding: 0 2px;
  }

  .fp-pinned:hover .card-header,
  .fp-slot-card:hover .card-header {
    background: var(--color-bg-hover);
  }

  /* ── Filter slot ── */

  .fp-filter-slot {
    padding: var(--space-md) var(--space-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .fp-slot-label {
    font-family: var(--font-heading);
    font-size: 0.75rem;
    font-weight: 400;
    letter-spacing: 0.1em;
    color: var(--color-text-muted);
    text-transform: uppercase;
    margin: 0;
  }

  .fp-slot-card {
    cursor: pointer;
    border: var(--border-width) solid var(--color-border);
    display: block;
    text-decoration: none;
  }

  .fp-slot-card:hover {
    background: var(--color-bg-hover);
  }

  .fp-slot-description {
    padding: var(--space-sm) var(--space-lg);
    font-size: 0.9rem;
    color: var(--color-text-muted);
    margin: 0;
    border-top: 1px solid var(--color-border-light);
  }

  .fp-see-more {
    font-family: var(--font-ui);
    font-size: 0.85rem;
    color: var(--color-text-muted);
    text-decoration: none;
    align-self: flex-end;
  }

  .fp-see-more:hover {
    color: var(--color-text);
    text-decoration: underline;
  }
</style>
