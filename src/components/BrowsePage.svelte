<script lang="ts">
  import { onMount } from 'svelte';
  import {
    filterStateFromParams,
    filterStateToParams,
    applyFilters,
    DIMENSIONS,
  } from '../lib/filters';
  import type { FilterState, Dimension } from '../lib/filters';
  import type { TagNode } from '../lib/browse-helpers';

  // ── Props ────────────────────────────────────────────────────────────────

  interface SerialisedCard {
    uid: string;
    title: string;
    description?: string;
    date: string | null;   // ISO string or null (dates serialised server-side)
    tags: string[];
    collection: string;
    id: string;
    renderer: string;
  }

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
  // If drillPath is empty, shows root nodes.  Otherwise shows the children
  // of the deepest drilled-into node.
  const currentNodes = $derived<TagNode[]>(() => {
    if (!openDimension) return [];
    const roots = hierarchies[openDimension] ?? [];
    if (drillPath.length === 0) return roots;

    // Walk down the hierarchy following drillPath values
    let nodes = roots;
    for (const val of drillPath) {
      const found = nodes.find(n => n.value === val);
      if (!found) return nodes; // safety: stop if path is invalid
      nodes = found.children;
    }
    return nodes;
  });

  // Active selections for a dimension (as a Set for O(1) lookup)
  function activeSelectionsFor(dim: Dimension): Set<string> {
    return new Set(filterState.selections[dim] ?? []);
  }

  // Whether a dimension has any active filter
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
      // Leaf node — select it and close the panel
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
    // Read initial filter state from URL on first render
    const params = new URLSearchParams(window.location.search);
    filterState = filterStateFromParams(params);

    // Keep filter state in sync with browser back/forward navigation
    function onPopstate() {
      const p = new URLSearchParams(window.location.search);
      filterState = filterStateFromParams(p);
      openDimension = null;
      drillPath = [];
    }
    window.addEventListener('popstate', onPopstate);

    // Close panel when clicking outside it
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
        <button
          class="browse-dim-btn"
          class:browse-dim-btn--active={isActive}
          class:browse-dim-btn--open={isOpen}
          onclick={() => togglePanel(dim)}
          aria-pressed={isOpen}
          aria-label="{dimensionLabels[dim]} filter{isActive ? ' (active)' : ''}"
          disabled={!hasNodes}
          title={hasNodes ? undefined : 'No tags available for this dimension'}
        >
          {dimensionLabels[dim]}
          {#if isActive}
            <span class="browse-dim-badge" aria-hidden="true">
              {(filterState.selections[dim] ?? []).length}
            </span>
          {/if}
        </button>

        {#if isOpen}
          <!-- Panel for this dimension -->
          <div
            class="browse-dim-panel"
            role="dialog"
            aria-label="{dimensionLabels[dim]} tag browser"
          >
            <div class="browse-dim-panel-header">
              {#if drillPath.length > 0}
                <button
                  class="browse-dim-back"
                  onclick={drillBack}
                  aria-label="Go back"
                >
                  ← Back
                </button>
              {:else}
                <span class="browse-dim-panel-title">{dimensionLabels[dim]}</span>
              {/if}
              {#if dimensionIsActive(dim)}
                <button
                  class="browse-dim-clear"
                  onclick={() => clearDimension(dim)}
                  aria-label="Clear {dimensionLabels[dim]} filters"
                >
                  Clear
                </button>
              {/if}
            </div>

            <ul class="browse-dim-list" role="listbox" aria-multiselectable="true">
              {#each currentNodes as node}
                {@const selected = activeSelectionsFor(dim).has(node.value)}
                <li
                  class="browse-dim-item"
                  class:browse-dim-item--selected={selected}
                  role="option"
                  aria-selected={selected}
                >
                  <button
                    class="browse-dim-item-btn"
                    onclick={() => selectFromPanel(dim, node.value)}
                    aria-label="{node.label} ({node.count} cards)"
                  >
                    <span class="browse-dim-item-label">{node.label}</span>
                    <span class="browse-dim-item-count">({node.count})</span>
                  </button>
                  {#if node.children.length > 0}
                    <button
                      class="browse-dim-drill"
                      onclick={(e) => { e.stopPropagation(); drillInto(node); }}
                      aria-label="Explore subcategories of {node.label}"
                    >
                      ›
                    </button>
                  {/if}
                </li>
              {/each}
              {#if currentNodes.length === 0}
                <li class="browse-dim-empty">No tags available</li>
              {/if}
            </ul>
          </div>
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
          <li class="browse-card-item" data-push-card={card.uid}>
            <div class="browse-card-header">
              <p class="browse-card-title">{card.title}</p>
              {#if card.date}
                <time
                  class="browse-card-date"
                  datetime={new Date(card.date).toISOString()}
                >
                  {new Date(card.date).toLocaleDateString('en-AU', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </time>
              {/if}
            </div>
            {#if card.description}
              <p class="browse-card-desc">{card.description}</p>
            {/if}
            {#if card.tags.length > 0}
              <ul class="browse-card-tags" aria-label="Tags">
                {#each card.tags as tag}
                  <li class="browse-card-tag">{tag}</li>
                {/each}
              </ul>
            {/if}
          </li>
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

  .browse-dim-btn {
    font-family: var(--font-heading);
    font-size: 1rem;
    padding: var(--space-xs) var(--space-md);
    border: var(--border-width) solid var(--color-border);
    background: transparent;
    color: var(--color-text);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    transition: background 0.15s;
  }

  .browse-dim-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .browse-dim-btn--active {
    background: var(--color-text);
    color: var(--color-surface);
  }

  .browse-dim-btn--open {
    border-bottom-color: transparent;
  }

  .browse-dim-btn:not(:disabled):hover:not(.browse-dim-btn--active) {
    background: var(--color-bg-hover);
  }

  .browse-dim-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25em;
    height: 1.25em;
    border-radius: 50%;
    background: var(--color-surface);
    color: var(--color-text);
    font-size: 0.75em;
    font-family: var(--font-ui);
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

  /* ── Dimension panel ── */
  .browse-dim-panel {
    position: absolute;
    top: 100%;
    left: 0;
    min-width: 220px;
    border: var(--border-width) solid var(--color-border);
    background: var(--color-surface);
    z-index: 100;
    box-shadow: 4px 4px 0 var(--color-border);
  }

  .browse-dim-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-xs) var(--space-sm);
    border-bottom: 1px solid var(--color-border-light);
    font-family: var(--font-heading);
    font-size: 0.85rem;
  }

  .browse-dim-panel-title {
    color: var(--color-text-muted);
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .browse-dim-back,
  .browse-dim-clear {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    padding: 2px var(--space-xs);
    border: 1px solid var(--color-border-light);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
  }

  .browse-dim-back:hover,
  .browse-dim-clear:hover {
    color: var(--color-text);
    border-color: var(--color-border);
  }

  .browse-dim-list {
    list-style: none;
    margin: 0;
    padding: var(--space-xs) 0;
    max-height: 320px;
    overflow-y: auto;
  }

  .browse-dim-item {
    display: flex;
    align-items: center;
  }

  .browse-dim-item--selected .browse-dim-item-btn {
    background: var(--color-text);
    color: var(--color-surface);
  }

  .browse-dim-item-btn {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    border: none;
    background: transparent;
    color: var(--color-text);
    cursor: pointer;
    text-align: left;
    font-family: var(--font-ui);
    font-size: 0.9rem;
  }

  .browse-dim-item-btn:hover {
    background: var(--color-bg-hover);
  }

  .browse-dim-item--selected .browse-dim-item-btn:hover {
    background: var(--color-text);
    opacity: 0.85;
  }

  .browse-dim-item-count {
    color: var(--color-text-muted);
    font-size: 0.8em;
    margin-left: auto;
  }

  .browse-dim-item--selected .browse-dim-item-count {
    color: var(--color-surface);
    opacity: 0.7;
  }

  .browse-dim-drill {
    padding: var(--space-xs) var(--space-sm);
    border: none;
    border-left: 1px solid var(--color-border-light);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: 1.1rem;
    line-height: 1;
    align-self: stretch;
    display: flex;
    align-items: center;
  }

  .browse-dim-drill:hover {
    background: var(--color-bg-hover);
    color: var(--color-text);
  }

  .browse-dim-empty {
    padding: var(--space-sm) var(--space-md);
    color: var(--color-text-muted);
    font-size: 0.9rem;
    font-style: italic;
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

  .browse-card-item {
    border: var(--border-width) solid var(--color-border);
    padding: var(--space-md);
    cursor: pointer;
    background: var(--color-surface);
    transition: background 0.1s;
  }

  .browse-card-item:hover {
    background: var(--color-bg-hover);
  }

  .browse-card-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-sm);
    margin-bottom: var(--space-xs);
  }

  .browse-card-title {
    font-family: var(--font-heading);
    font-size: 1rem;
    margin: 0;
  }

  .browse-card-date {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .browse-card-desc {
    font-size: 0.85rem;
    color: var(--color-text-muted);
    margin: 0 0 var(--space-xs);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .browse-card-tags {
    list-style: none;
    margin: var(--space-xs) 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .browse-card-tag {
    font-size: 0.7rem;
    font-family: var(--font-ui);
    padding: 1px 6px;
    border: 1px solid var(--color-border-light);
    color: var(--color-text-muted);
  }
</style>
