<script lang="ts">
  import { onMount } from 'svelte';
  import { DIMENSIONS } from '../lib/filters';
  import type { Dimension, FilterState } from '../lib/filters';
  import type { TagNode } from '../lib/browse-helpers';
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
          onClear={() => onClearDimension(dim)}
        />
      {/if}
    </div>
  {/each}

</div>

<style>
  .fp-dimension-controls {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-sm) 0;
    border-bottom: var(--border-width) solid var(--color-border);
    background: var(--color-surface);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .fp-dim-wrapper {
    position: relative;
    flex: 1;
    min-width: 0;
  }

  .fp-dim-wrapper :global(.browse-dim-btn) {
    width: 100%;
    justify-content: center;
  }

</style>
