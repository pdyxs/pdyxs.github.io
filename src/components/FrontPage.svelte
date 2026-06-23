<script lang="ts">
  import { onMount } from 'svelte';
  import { selectSlotCard } from '../lib/slot-selection';
  import { markDisplayed } from '../lib/card-view-state';
  import { buildBrowseUrl } from '../lib/frontpage';
  import type { FrontPageConfig } from '../lib/frontpage';
  import {
    filterStateFromParams,
    filterStateToParams,
    applyFilters,
    DIMENSIONS,
  } from '../lib/filters';
  import type { FilterState, Dimension } from '../lib/filters';
  import type { TagNode } from '../lib/browse-helpers';
  import DimensionButton from './DimensionButton.svelte';
  import DimensionPanel from './DimensionPanel.svelte';
  import BrowseCard from './BrowseCard.svelte';

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
    hierarchies: Record<Dimension, TagNode[]>;
  }

  let { config, cards, hierarchies }: Props = $props();

  // ── Filter state ──────────────────────────────────────────────────────────

  let filterState = $state<FilterState>({ selections: {} });
  let openDimension = $state<Dimension | null>(null);
  let drillPath = $state<string[]>([]);

  const hasActiveFilters = $derived(
    Object.values(filterState.selections).some(v => v && v.length > 0)
  );

  const cardMetas = $derived(
    cards.map(c => ({
      ...c,
      date: c.date ? new Date(c.date) : undefined,
    }))
  );

  const filteredCards = $derived(applyFilters(cardMetas, filterState));

  const dimensionLabels: Record<Dimension, string> = {
    what: 'What',
    when: 'When',
    where: 'Where',
    who: 'Who',
    why: 'Why',
  };

  const currentNodes = $derived.by<TagNode[]>(() => {
    if (!openDimension) return [];
    const roots = hierarchies[openDimension] ?? [];
    if (drillPath.length === 0) return roots;
    let nodes = roots;
    for (const val of drillPath) {
      const found = nodes.find(n => n.value === val);
      if (!found) return nodes;
      nodes = found.children;
    }
    return nodes;
  });

  function activeSelectionsFor(dim: Dimension): Set<string> {
    return new Set(filterState.selections[dim] ?? []);
  }

  function dimensionIsActive(dim: Dimension): boolean {
    const sel = filterState.selections[dim];
    return !!(sel && sel.length > 0);
  }

  // ── URL sync ──────────────────────────────────────────────────────────────

  function pushToUrl(state: FilterState) {
    const params = filterStateToParams(state);
    const query = params.toString();
    history.pushState(null, '', query ? `/?${query}` : '/');
  }

  // ── Filter mutations ──────────────────────────────────────────────────────

  function toggleFilterValue(dim: Dimension, value: string) {
    const existing = filterState.selections[dim] ?? [];
    const updated = existing.includes(value)
      ? existing.filter(v => v !== value)
      : [...existing, value];
    const newSelections = { ...filterState.selections };
    if (updated.length === 0) {
      delete newSelections[dim];
    } else {
      newSelections[dim] = updated;
    }
    filterState = { ...filterState, selections: newSelections };
    pushToUrl(filterState);
  }

  function clearDimension(dim: Dimension) {
    const newSelections = { ...filterState.selections };
    delete newSelections[dim];
    filterState = { ...filterState, selections: newSelections };
    pushToUrl(filterState);
  }

  function clearAllFilters() {
    filterState = { selections: {} };
    pushToUrl(filterState);
  }

  // ── Panel interactions ────────────────────────────────────────────────────

  function togglePanel(dim: Dimension) {
    if (openDimension === dim) {
      openDimension = null;
      drillPath = [];
    } else {
      openDimension = dim;
      drillPath = [];
    }
  }

  function drillInto(node: TagNode) {
    if (node.children.length > 0) {
      drillPath = [...drillPath, node.value];
    } else {
      toggleFilterValue(openDimension!, node.value);
      openDimension = null;
      drillPath = [];
    }
  }

  function drillBack() {
    drillPath = drillPath.slice(0, -1);
  }

  function selectFromPanel(dim: Dimension, value: string) {
    toggleFilterValue(dim, value);
    openDimension = null;
    drillPath = [];
  }

  // ── Resolved front page slots ─────────────────────────────────────────────

  type ResolvedPinned = {
    type: 'pinned';
    uid: string;
    title: string;
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
    const params = new URLSearchParams(window.location.search);
    filterState = filterStateFromParams(params);

    function onPopstate() {
      const p = new URLSearchParams(window.location.search);
      filterState = filterStateFromParams(p);
      openDimension = null;
      drillPath = [];
    }
    window.addEventListener('popstate', onPopstate);

    function onDocumentClick(e: MouseEvent) {
      const target = e.target as Element;
      if (!target.closest('.fp-dimension-controls') && openDimension !== null) {
        openDimension = null;
        drillPath = [];
      }
    }
    document.addEventListener('click', onDocumentClick, { capture: true });

    const now = new Date();
    const byUid = new Map(cards.map(c => [c.uid, c]));
    const resolved: ResolvedSlot[] = [];

    for (const slot of config.slots) {
      if (slot.type === 'pinned') {
        const card = byUid.get(slot.uid);
        if (card) {
          resolved.push({ type: 'pinned', uid: card.uid, title: card.title, description: card.description });
        }
      } else {
        const meta = selectSlotCard(cardMetas, slot.filter, now);
        if (meta) {
          markDisplayed(meta.uid, meta.contentHash);
        }
        const card = meta ? byUid.get(meta.uid) ?? null : null;
        resolved.push({ type: 'filter', label: slot.label, card, browseUrl: buildBrowseUrl(slot.filter) });
      }
    }

    resolvedSlots = resolved;

    return () => {
      window.removeEventListener('popstate', onPopstate);
      document.removeEventListener('click', onDocumentClick, { capture: true });
    };
  });
</script>

<div class="fp-page">
  <!-- ── Dimension filter buttons ── -->
  <div class="fp-dimension-controls" role="toolbar" aria-label="5W dimension filters">
    {#each DIMENSIONS as dim}
      {@const isActive = dimensionIsActive(dim)}
      {@const isOpen = openDimension === dim}
      {@const hasNodes = (hierarchies[dim] ?? []).length > 0}

      <div class="fp-dim-wrapper">
        <DimensionButton
          label={dimensionLabels[dim]}
          {isActive}
          {isOpen}
          {hasNodes}
          selectionCount={(filterState.selections[dim] ?? []).length}
          onToggle={() => togglePanel(dim)}
        />

        {#if isOpen}
          <DimensionPanel
            dimensionLabel={dimensionLabels[dim]}
            {drillPath}
            currentNodes={currentNodes}
            activeSelections={activeSelectionsFor(dim)}
            isDimensionActive={isActive}
            onSelectValue={(value) => selectFromPanel(dim, value)}
            onDrillInto={drillInto}
            onDrillBack={drillBack}
            onClear={() => clearDimension(dim)}
          />
        {/if}
      </div>
    {/each}

    {#if hasActiveFilters}
      <button class="fp-clear-all" onclick={clearAllFilters} aria-label="Clear all filters">
        Clear all
      </button>
    {/if}
  </div>

  <!-- ── Active filter chips ── -->
  {#if hasActiveFilters}
    <div class="fp-active-filters" aria-label="Active filters">
      {#each DIMENSIONS as dim}
        {#each (filterState.selections[dim] ?? []) as val}
          <button
            class="fp-filter-chip"
            onclick={() => toggleFilterValue(dim, val)}
            aria-label="Remove filter: {val}"
          >
            {val} ×
          </button>
        {/each}
      {/each}
    </div>
  {/if}

  <!-- ── Content: browse results or front page slots ── -->
  {#if hasActiveFilters}
    <main class="fp-browse-grid" aria-label="Browse results">
      <p class="fp-result-count">
        {filteredCards.length} card{filteredCards.length === 1 ? '' : 's'}
      </p>

      {#if filteredCards.length === 0}
        <p class="fp-browse-empty">No cards match the current filters.</p>
      {:else}
        <ul class="fp-browse-list">
          {#each filteredCards as card (card.uid)}
            <BrowseCard {card} />
          {/each}
        </ul>
      {/if}
    </main>
  {:else}
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
  {/if}
</div>

<style>
  .fp-page {
    display: flex;
    flex-direction: column;
  }

  /* ── Dimension controls ── */

  .fp-dimension-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-lg);
    border-bottom: var(--border-width) solid var(--color-border);
    background: var(--color-surface);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .fp-dim-wrapper {
    position: relative;
  }

  .fp-clear-all {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--color-border-light);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    margin-left: auto;
  }

  .fp-clear-all:hover {
    color: var(--color-text);
    border-color: var(--color-border);
  }

  /* ── Active filter chips ── */

  .fp-active-filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-lg);
    border-bottom: 1px solid var(--color-border-light);
  }

  .fp-filter-chip {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    padding: 2px var(--space-sm);
    border: 1px solid var(--color-border);
    background: var(--color-text);
    color: var(--color-surface);
    cursor: pointer;
  }

  .fp-filter-chip:hover {
    opacity: 0.8;
  }

  /* ── Browse results ── */

  .fp-browse-grid {
    padding: var(--space-md) var(--space-lg);
  }

  .fp-result-count {
    font-family: var(--font-ui);
    font-size: 0.85rem;
    color: var(--color-text-muted);
    margin-bottom: var(--space-md);
  }

  .fp-browse-empty {
    color: var(--color-text-muted);
    font-style: italic;
  }

  .fp-browse-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-md);
  }

  /* ── Front page slots ── */

  .front-page-slots {
    display: flex;
    flex-direction: column;
    gap: 0;
    border: var(--border-width) solid var(--color-border);
  }

  .front-page-slots > :not(:first-child) {
    border-top: var(--border-width) solid var(--color-border);
  }

  .fp-pinned {
    cursor: pointer;
  }

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
