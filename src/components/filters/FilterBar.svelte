<script lang="ts">
  import { onMount } from 'svelte';
  import { FIVE_W_DIMENSIONS } from '@content/tags/five-w';
  import type { FiveWDimension } from '@content/tags/five-w';
  import { DIMENSIONS, filterStateToParams, selectedValues } from '@dimensions';
  import type { DimensionId, FilterState } from '@dimensions';
  import type { WireTagNode, TagSection } from '@browse/results/browse-helpers';
  import type { TagDisplay } from '@content/tags/tag-display';
  import { displayFor } from '@content/tags/tag-display';
  import { filterVisibleNodes, groupNodesIntoSections } from '@browse/results/browse-helpers';
  import { lensesForDimension, lensIdFromUid, activeLensIcon, isLensVisible } from '@browse/lenses/lens-registry';
  import { stackStore } from '@stores/card-stack-store';
  import { activeEntry } from '@stack/layout/stack-layout';
  import DimensionButton from '@components/filters/DimensionButton.svelte';
  import DimensionPanel from '@components/filters/DimensionPanel.svelte';

  interface Props {
    hierarchies: Record<string, WireTagNode[]>;
    /** Where every node's name, `declared` and `group` come from — nodes carry
     * only structure (see WireTagNode). */
    tagDisplay?: Record<string, TagDisplay>;
    /** Per-dimension section order for the root-level panel (see
     * groupNodesIntoSections). Dimensions absent here fall back to the default
     * (alphabetical) group ordering. */
    groupOrder?: Partial<Record<FiveWDimension, string[]>>;
    filterState: FilterState;
    /** Passed straight through to every DimensionButton, so a disabled button
     * can say whether the dimension is empty or merely unarrived. */
    poolState?: 'ready' | 'pending' | 'failed';
    onFilterToggle: (dimensionId: DimensionId, value: string) => void;
    onClearDimension: (dimensionId: DimensionId) => void;
  }

  let {
    hierarchies,
    tagDisplay = {},
    groupOrder = {},
    filterState,
    poolState = 'ready',
    onFilterToggle,
    onClearDimension,
  }: Props = $props();

  let openDimension = $state<FiveWDimension | null>(null);
  let drillPath = $state<string[]>([]);

  const dimensionLabels: Record<FiveWDimension, string> = {
    what: 'What',
    when: 'When',
    where: 'Where',
    who: 'Who',
    why: 'Why',
  };

  function visibleNodesFor(dim: FiveWDimension): WireTagNode[] {
    return filterVisibleNodes(hierarchies[dim] ?? [], activeSelectionsFor(dim), tagDisplay);
  }

  // Walks the current drillPath, returning the node it points at (`node`, the
  // header title source) and the level to render (`nodes`, that node's
  // children). An unresolved path stops early and shows the last good level.
  function resolveDrill(dim: FiveWDimension, path: string[]): { node: WireTagNode | null; nodes: WireTagNode[] } {
    let nodes = [...guestNodesFor(dim), ...visibleNodesFor(dim)];
    let node: WireTagNode | null = null;
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
    const order = groupOrder[openDimension] ?? [];
    // Every level partitions into declared sections, not just the root: the
    // puzzle difficulties (a generated group) sit below the puzzle series one
    // drill down. A level whose nodes are all ungrouped yields one section,
    // which renders as a flat list with no divider — i.e. unchanged.
    if (drillPath.length === 0) {
      const sections = groupNodesIntoSections(visibleNodesFor(openDimension), order, tagDisplay);
      // A dimension that declares this panel as its placement (the dev-only
      // status dimension does) contributes its own section at the very top,
      // below the lens list and above this panel's own values. In production
      // it isn't registered, so this is simply empty.
      const guests = guestNodesFor(openDimension);
      return guests.length > 0 ? [{ nodes: guests }, ...sections] : sections;
    }
    return groupNodesIntoSections(resolveDrill(openDimension, drillPath).nodes, order, tagDisplay);
  });

  // Display name of the drilled-into node, for the panel header (empty at root).
  const currentDrillTitle = $derived(
    openDimension && drillPath.length > 0
      ? displayName(resolveDrill(openDimension, drillPath).node)
      : ''
  );

  function displayName(node: WireTagNode | null): string {
    return node ? displayFor(node.value, tagDisplay).name : '';
  }

  function dimensionIsActive(dim: FiveWDimension): boolean {
    return selectedValues(filterState, dim).length > 0;
  }

  /** Nodes contributed to this panel by other dimensions (see DimensionPlacement). */
  function guestNodesFor(dim: FiveWDimension): WireTagNode[] {
    return DIMENSIONS
      .filter(d => d.placement?.panel === dim)
      .flatMap(d => filterVisibleNodes(hierarchies[d.id] ?? [], activeSelectionsFor(dim), tagDisplay));
  }

  /** Highlighted values for this panel — this dimension's own selection plus
   * any guest dimension's, since guest nodes render inside this panel too. */
  function activeSelectionsFor(dim: FiveWDimension): Set<string> {
    const active = new Set(selectedValues(filterState, dim));
    for (const d of DIMENSIONS) {
      if (d.placement?.panel !== dim) continue;
      for (const value of selectedValues(filterState, d.id)) active.add(value);
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

  function drillInto(node: WireTagNode) {
    if (node.children.length > 0) {
      drillPath = [...drillPath, node.value];
    } else {
      selectNode(node);
    }
  }

  function drillBack() {
    drillPath = drillPath.slice(0, -1);
  }

  // Routes by the node's own dimension, so a guest node selects on its own
  // axis rather than the panel it happens to be rendered in.
  function selectNode(node: WireTagNode) {
    onFilterToggle(node.dimensionId, node.value);
    openDimension = null;
    drillPath = [];
  }

  // The globally active lens (if any) — sourced from the single source of
  // truth for stack state, so at most one dimension button ever shows an
  // icon, and it reflects the active lens wherever it sits in the stack.
  const activeLensId = $derived(lensIdFromUid(activeEntry($stackStore)?.uid ?? null));

  // Current filter selections, serialised so a lens replacement (below)
  // carries them into the new location — it reads window.location.search
  // on mount, same as this component does.
  const carryFilterParams = $derived(filterStateToParams(filterState).toString());

  function selectLensFromPanel(_lensId: string) {
    openDimension = null;
    drillPath = [];
  }

  let bar: HTMLElement;

  onMount(() => {
    // Publish the owning card's header height so the sticky bar can sit below it
    // (issue #115). Only this bar's own style is written; the stack is not touched.
    // A page-mode lens has its `.card-header` display:none, which measures 0.
    const header = bar.closest('.stack-card')?.querySelector(':scope > .card-header');
    let observer: ResizeObserver | undefined;
    if (header && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        bar.style.setProperty('--card-header-stuck-height', `${header.getBoundingClientRect().height}px`);
      });
      observer.observe(header);
    }

    function onDocumentClick(e: MouseEvent) {
      const target = e.target as Element;
      // `.browse-dim-panel` is portaled to <body> (see DimensionPanel), so it
      // is no longer inside the toolbar — without this a click on any panel
      // row would read as an outside click and close the panel under it.
      const inside = target.closest('.fp-dimension-controls') || target.closest('.browse-dim-panel');
      if (!inside && openDimension !== null) {
        openDimension = null;
        drillPath = [];
      }
    }
    document.addEventListener('click', onDocumentClick, { capture: true });
    return () => {
      observer?.disconnect();
      document.removeEventListener('click', onDocumentClick, { capture: true });
    };
  });
</script>

<div class="fp-dimension-controls" role="toolbar" bind:this={bar} aria-label="5W dimension filters">
  {#each FIVE_W_DIMENSIONS as dim}
    {@const isActive = dimensionIsActive(dim)}
    {@const isOpen = openDimension === dim}
    {@const hasNodes = visibleNodesFor(dim).length + guestNodesFor(dim).length > 0}
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
        {poolState}
        selectionCount={selectedValues(filterState, dim).length}
        onToggle={() => togglePanel(dim)}
        {lensIcon}
      />

      {#if isOpen}
        <DimensionPanel
          dimensionLabel={dimensionLabels[dim]}
          {drillPath}
          drillTitle={currentDrillTitle}
          sections={currentSections}
          {tagDisplay}
          activeSelections={activeSelectionsFor(dim)}
          isDimensionActive={isActive}
          onSelectValue={selectNode}
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
    /* Clears the stuck active header (z-index 11, card-header.css). Its height
       is content-driven — a title can wrap — so the script measures it rather
       than the CSS guessing; 0px is the page-mode / pre-hydration value. */
    top: var(--card-header-stuck-height, 0px);
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
