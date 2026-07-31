<script lang="ts">
  import { onMount } from 'svelte';
  import { FIVE_W_DIMENSIONS, filterStateToParams } from '../lib/filters';
  import type { FiveWDimension, FilterState } from '../lib/filters';
  import type { TagNode, TagSection } from '../lib/browse-helpers';
  import { filterVisibleNodes, groupNodesIntoSections } from '../lib/browse-helpers';
  import { lensesForDimension, lensIdFromUid, activeLensIcon, isLensVisible } from '../lib/lens-registry';
  import { stackStore } from '../stores/card-stack-store';
  import { STATUS_FACET_VALUE, STATUS_LEAF_PREFIX } from '../lib/status-facet-node';
  import DimensionButton from './DimensionButton.svelte';
  import DimensionPanel from './DimensionPanel.svelte';

  interface Props {
    hierarchies: Record<FiveWDimension, TagNode[]>;
    /** Per-dimension section order for the root-level panel (see
     * groupNodesIntoSections). Dimensions absent here fall back to the default
     * (alphabetical) group ordering. */
    groupOrder?: Partial<Record<FiveWDimension, string[]>>;
    filterState: FilterState;
    onFilterToggle: (dim: FiveWDimension, value: string) => void;
    onClearDimension: (dim: FiveWDimension) => void;
  }

  let { hierarchies, groupOrder = {}, filterState, onFilterToggle, onClearDimension }: Props = $props();

  let openDimension = $state<FiveWDimension | null>(null);
  let drillPath = $state<string[]>([]);

  const dimensionLabels: Record<FiveWDimension, string> = {
    what: 'What',
    when: 'When',
    where: 'Where',
    who: 'Who',
    why: 'Why',
  };

  function visibleNodesFor(dim: FiveWDimension): TagNode[] {
    return filterVisibleNodes(hierarchies[dim] ?? [], activeSelectionsFor(dim));
  }

  // Walks the current drillPath, returning the node it points at (`node`, the
  // header title source) and the level to render (`nodes`, that node's
  // children). An unresolved path stops early and shows the last good level.
  function resolveDrill(dim: FiveWDimension, path: string[]): { node: TagNode | null; nodes: TagNode[] } {
    let nodes = visibleNodesFor(dim);
    let node: TagNode | null = null;
    for (const val of path) {
      const found = nodes.find(n => n.value === val);
      if (!found) break;
      node = found;
      nodes = found.children;
    }
    return { node, nodes };
  }

  const currentSections = $derived.by<TagSection[]>(() => {
    if (!openDimension) return [];
    // At the root level, partition into declared sections; drilled-in levels
    // render flat (a single unlabelled section).
    if (drillPath.length === 0) {
      const nodes = visibleNodesFor(openDimension);
      // The dev-only Status facet node (injected at the head of the What
      // hierarchy — see status-facet-node.ts) renders as its own section at the
      // very top, below the lens list and above the real filter sections. In a
      // production build it's never injected, so this find is simply null.
      const statusNode = nodes.find(n => n.value === STATUS_FACET_VALUE);
      const rest = statusNode ? nodes.filter(n => n !== statusNode) : nodes;
      const sections = groupNodesIntoSections(rest, groupOrder[openDimension] ?? []);
      return statusNode ? [{ nodes: [statusNode] }, ...sections] : sections;
    }
    return [{ nodes: resolveDrill(openDimension, drillPath).nodes }];
  });

  // Display name of the drilled-into node, for the panel header (empty at root).
  const currentDrillTitle = $derived(
    openDimension && drillPath.length > 0
      ? resolveDrill(openDimension, drillPath).node?.name ?? ''
      : ''
  );

  function dimensionIsActive(dim: FiveWDimension): boolean {
    const sel = filterState.selections[dim];
    return !!(sel && sel.length > 0);
  }

  function activeSelectionsFor(dim: FiveWDimension): Set<string> {
    const active = new Set(filterState.selections[dim] ?? []);
    // The dev-only Status facet lives under What but routes to
    // FilterState.status (not a `what:` bucket), so surface the active status
    // as a synthetic selection here — that's what highlights the chosen leaf
    // and marks the "Status" parent as containing a selection. Inert outside
    // dev, where the facet node isn't present and status is always undefined.
    if (dim === 'what' && filterState.status) {
      active.add(`${STATUS_LEAF_PREFIX}${filterState.status}`);
    }
    return active;
  }

  function togglePanel(dim: FiveWDimension) {
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

  function selectFromPanel(dim: FiveWDimension, value: string) {
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
  {#each FIVE_W_DIMENSIONS as dim}
    {@const isActive = dimensionIsActive(dim)}
    {@const isOpen = openDimension === dim}
    {@const hasNodes = visibleNodesFor(dim).length > 0}
    {@const lenses = lensesForDimension(dim).filter(l => isLensVisible(l, import.meta.env.DEV))}

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
          drillTitle={currentDrillTitle}
          sections={currentSections}
          activeSelections={activeSelectionsFor(dim)}
          isDimensionActive={isActive}
          onSelectValue={(value) => selectFromPanel(dim, value)}
          onDrillInto={drillInto}
          onDrillBack={drillBack}
          onClear={() => onClearDimension(dim)}
          {lenses}
          {activeLensId}
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
    /* Vertical room for the indicator strips that hang above/below the button.
       The strips (rendered by DimensionButton as siblings of the button) are
       absolutely positioned against this box and read --dim-indicator-reserve
       to find the button's edges. Was formerly a `margin: 1em 0` on the
       button; moved here so the strips share the wrapper's box bounds. */
    --dim-indicator-reserve: 1rem;
    padding: var(--dim-indicator-reserve) 0;
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
