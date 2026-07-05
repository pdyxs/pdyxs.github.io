<script lang="ts">
  import { onMount } from 'svelte';
  import { DIMENSIONS, filterStateToParams } from '../lib/filters';
  import type { Dimension, FilterState } from '../lib/filters';
  import type { TagNode } from '../lib/browse-helpers';
  import { lensesForDimension, lensIdFromUid, activeLensIcon } from '../lib/lens-registry';
  import { stackStore } from '../stores/card-stack-store';
  import DimensionButton from './DimensionButton.svelte';
  import DimensionPanel from './DimensionPanel.svelte';

  interface Props {
    hierarchies: Record<Dimension, TagNode[]>;
    filterState: FilterState;
    onFilterToggle: (dim: Dimension, value: string) => void;
    onClearDimension: (dim: Dimension) => void;
  }

  let { hierarchies, filterState, onFilterToggle, onClearDimension }: Props = $props();

  let openDimension = $state<Dimension | null>(null);
  let drillPath = $state<string[]>([]);

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

  function dimensionIsActive(dim: Dimension): boolean {
    const sel = filterState.selections[dim];
    return !!(sel && sel.length > 0);
  }

  function activeSelectionsFor(dim: Dimension): Set<string> {
    return new Set(filterState.selections[dim] ?? []);
  }

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
      onFilterToggle(openDimension!, node.value);
      openDimension = null;
      drillPath = [];
    }
  }

  function drillBack() {
    drillPath = drillPath.slice(0, -1);
  }

  function selectFromPanel(dim: Dimension, value: string) {
    onFilterToggle(dim, value);
    openDimension = null;
    drillPath = [];
  }

  // The globally active lens (if any) — sourced from the single source of
  // truth for stack state, so at most one dimension button ever shows an
  // icon, and it reflects the active lens wherever it sits in the stack.
  const activeLensId = $derived(lensIdFromUid($stackStore.activeKey));

  // Current filter selections, serialised so a lens replacement (below)
  // carries them into the new location — it reads window.location.search
  // on mount, same as this component does.
  const carryFilterParams = $derived(filterStateToParams(filterState).toString());

  function selectLensFromPanel(_lensId: string) {
    openDimension = null;
    drillPath = [];
  }

  onMount(() => {
    function onDocumentClick(e: MouseEvent) {
      const target = e.target as Element;
      if (!target.closest('.fp-dimension-controls') && openDimension !== null) {
        openDimension = null;
        drillPath = [];
      }
    }
    document.addEventListener('click', onDocumentClick, { capture: true });
    return () => document.removeEventListener('click', onDocumentClick, { capture: true });
  });
</script>

<div class="fp-dimension-controls" role="toolbar" aria-label="5W dimension filters">
  {#each DIMENSIONS as dim}
    {@const isActive = dimensionIsActive(dim)}
    {@const isOpen = openDimension === dim}
    {@const hasNodes = (hierarchies[dim] ?? []).length > 0}
    {@const lenses = lensesForDimension(dim)}

    {@const lensIcon = activeLensIcon(lenses, activeLensId)}
    <div
      class="fp-dim-wrapper"
      class:fp-dim-wrapper--filter-active={isActive}
      class:fp-dim-wrapper--lens-active={!!lensIcon}
    >
      <DimensionButton
        label={dimensionLabels[dim]}
        {isActive}
        {isOpen}
        {hasNodes}
        selectionCount={(filterState.selections[dim] ?? []).length}
        onToggle={() => togglePanel(dim)}
        {lensIcon}
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
          onClear={() => onClearDimension(dim)}
          {lenses}
          {carryFilterParams}
          onSelectLens={selectLensFromPanel}
        />
      {/if}
    </div>
  {/each}

</div>

<style>
  .fp-dimension-controls {
    display: flex;
    flex-wrap: nowrap;
    align-items: flex-start;
    gap: var(--space-xs);
    padding: 0.2em 0;
    border-bottom: var(--border-width) solid var(--color-border);
    background: var(--color-bg);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .fp-dim-wrapper {
    position: relative;
    flex: 1;
    min-width: 0;
    z-index: 1;
  }

  /* The filter-count dot strip hangs below the button; keep it behind
     neighboring dimension buttons rather than painting over them. */
  .fp-dim-wrapper--filter-active {
    z-index: 0;
  }

  /* The active-lens icon hangs above the button; it should rise above
     neighboring dimension buttons (and above filter-active ones). */
  .fp-dim-wrapper--lens-active {
    z-index: 2;
  }

  .fp-dim-wrapper :global(.browse-dim-btn) {
    width: 100%;
    justify-content: center;
  }

</style>
