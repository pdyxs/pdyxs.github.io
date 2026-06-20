<script lang="ts">
  import { onMount } from 'svelte';
  import {
    filterStateFromParams,
    filterStateToParams,
    applyFilters,
    DIMENSIONS,
  } from '../lib/filters';
  import type { FilterState, Dimension } from '../lib/filters';
  import type { TagNode, SerialisedCard } from '../lib/browse-helpers';
  import DimensionButton from './DimensionButton.svelte';
  import DimensionPanel from './DimensionPanel.svelte';
  import BrowseCard from './BrowseCard.svelte';

  // ── Props ────────────────────────────────────────────────────────────────

  interface Props {
    cards: SerialisedCard[];
    hierarchies: Record<Dimension, TagNode[]>;
  }

  let { cards, hierarchies }: Props = $props();

  // ── State ────────────────────────────────────────────────────────────────

  let filterState = $state<FilterState>({ selections: {} });

  // Which dimension panel is currently open (null = all closed)
  let openDimension = $state<Dimension | null>(null);

  // Track drill-down path within the open dimension
  let drillPath = $state<string[]>([]);

  // ── Derived ──────────────────────────────────────────────────────────────

  // Re-hydrate dates for filtering
  const hydratedCards = $derived(
    cards.map(c => ({
      ...c,
      date: c.date ? new Date(c.date) : undefined,
    }))
  );

  const filteredCards = $derived(applyFilters(hydratedCards, filterState));

  // Human-readable dimension labels
  const dimensionLabels: Record<Dimension, string> = {
    what: 'What',
    when: 'When',
    where: 'Where',
    who: 'Who',
    why: 'Why',
  };

  // Returns the current nodes to show in the open dimension panel.
  const currentNodes = $derived<TagNode[]>(() => {
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

  // Active selections for a dimension (as a Set for O(1) lookup)
  function activeSelectionsFor(dim: Dimension): Set<string> {
    return new Set(filterState.selections[dim] ?? []);
  }

  function dimensionIsActive(dim: Dimension): boolean {
    const sel = filterState.selections[dim];
    return !!(sel && sel.length > 0);
  }

  // ── URL sync ─────────────────────────────────────────────────────────────

  function pushToUrl(state: FilterState) {
    const params = filterStateToParams(state);
    const query = params.toString();
    const newUrl = query ? `/browse?${query}` : '/browse';
    history.pushState(null, '', newUrl);
  }

  // ── Filter mutations ─────────────────────────────────────────────────────

  function toggleFilterValue(dim: Dimension, value: string) {
    const existing = filterState.selections[dim] ?? [];
    let updated: string[];
    if (existing.includes(value)) {
      updated = existing.filter(v => v !== value);
    } else {
      updated = [...existing, value];
    }
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

  // ── Panel interactions ───────────────────────────────────────────────────

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

  // ── Lifecycle ────────────────────────────────────────────────────────────

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
      if (!target.closest('.browse-dimension-controls') && openDimension !== null) {
        openDimension = null;
        drillPath = [];
      }
    }
    document.addEventListener('click', onDocumentClick, { capture: true });

    return () => {
      window.removeEventListener('popstate', onPopstate);
      document.removeEventListener('click', onDocumentClick, { capture: true });
    };
  });
</script>

<div class="browse-page">
  <!-- ── Dimension control strip ── -->
  <div class="browse-dimension-controls" role="toolbar" aria-label="5W dimension filters">
    {#each DIMENSIONS as dim}
      {@const isActive = dimensionIsActive(dim)}
      {@const isOpen = openDimension === dim}
      {@const hasNodes = (hierarchies[dim] ?? []).length > 0}

      <div class="browse-dim-wrapper">
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

    {#if Object.keys(filterState.selections).some(dim => (filterState.selections[dim as Dimension] ?? []).length > 0)}
      <button
        class="browse-clear-all"
        onclick={clearAllFilters}
        aria-label="Clear all filters"
      >
        Clear all
      </button>
    {/if}
  </div>

  <!-- ── Active filter summary ── -->
  {#if Object.values(filterState.selections).some(v => v && v.length > 0)}
    <div class="browse-active-filters" aria-label="Active filters">
      {#each DIMENSIONS as dim}
        {#each (filterState.selections[dim] ?? []) as val}
          <button
            class="browse-filter-chip"
            onclick={() => toggleFilterValue(dim, val)}
            aria-label="Remove filter: {val}"
          >
            {val} ×
          </button>
        {/each}
      {/each}
    </div>
  {/if}

  <!-- ── Card grid ── -->
  <main class="browse-card-grid" aria-label="Browse results">
    <p class="browse-result-count">
      {filteredCards.length} card{filteredCards.length === 1 ? '' : 's'}
    </p>

    {#if filteredCards.length === 0}
      <p class="browse-empty">No cards match the current filters.</p>
    {:else}
      <ul class="browse-card-list">
        {#each filteredCards as card (card.uid)}
          <BrowseCard {card} />
        {/each}
      </ul>
    {/if}
  </main>
</div>

<style>
  /* ── Page layout ── */
  .browse-page {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  /* ── Dimension control strip ── */
  .browse-dimension-controls {
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

  .browse-dim-wrapper {
    position: relative;
  }

  .browse-clear-all {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--color-border-light);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    margin-left: auto;
  }

  .browse-clear-all:hover {
    color: var(--color-text);
    border-color: var(--color-border);
  }

  /* ── Active filters row ── */
  .browse-active-filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-lg);
    border-bottom: 1px solid var(--color-border-light);
  }

  .browse-filter-chip {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    padding: 2px var(--space-sm);
    border: 1px solid var(--color-border);
    background: var(--color-text);
    color: var(--color-surface);
    cursor: pointer;
  }

  .browse-filter-chip:hover {
    opacity: 0.8;
  }

  /* ── Card grid ── */
  .browse-card-grid {
    padding: var(--space-md) var(--space-lg);
  }

  .browse-result-count {
    font-family: var(--font-ui);
    font-size: 0.85rem;
    color: var(--color-text-muted);
    margin-bottom: var(--space-md);
  }

  .browse-empty {
    color: var(--color-text-muted);
    font-style: italic;
  }

  .browse-card-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-md);
  }
</style>
