<script lang="ts">
  import { onMount } from 'svelte';
  import type { TagNode, TagSection } from '../lib/browse-helpers';
  import type { LensDefinition } from '../lib/lens-registry';
  import { lensUid } from '../lib/lens-registry';
  import LensIcon from './LensIcon.svelte';

  interface Props {
    dimensionLabel: string;
    drillPath: string[];
    /** Display name of the drilled-into node, shown beside the Back button. */
    drillTitle: string;
    /** Root-level nodes partitioned into sections (see groupNodesIntoSections);
     * a single unlabelled section renders as a flat list. Drilled-in levels
     * pass one unlabelled section. */
    sections: TagSection[];
    activeSelections: Set<string>;
    isDimensionActive: boolean;
    onSelectValue: (value: string) => void;
    onDrillInto: (node: TagNode) => void;
    onDrillBack: () => void;
    onClear: () => void;
    /** Lenses filed under this dimension (src/lib/lens-registry.ts) — listed
     * above the filter listbox. Plain data only; never imports a lens's
     * actual component, so the lazy-load boundary holds. */
    lenses: LensDefinition[];
    /** The globally active lens id (or null). The matching lens item in this
     * panel renders selected, mirroring how an active tag looks selected. */
    activeLensId: string | null;
    /** Current filter selections, serialised, so a lens replacement carries
     * them across the swap (e.g. "filter.what=projects"). Only ever
     * attached to a lens that declares acceptsFilters — a lens that can't
     * handle filters (e.g. home) must never receive them in the first place. */
    carryFilterParams: string;
    onSelectLens: (lensId: string) => void;
  }

  let {
    dimensionLabel,
    drillPath,
    drillTitle,
    sections,
    activeSelections,
    isDimensionActive,
    onSelectValue,
    onDrillInto,
    onDrillBack,
    onClear,
    lenses,
    activeLensId,
    carryFilterParams,
    onSelectLens,
  }: Props = $props();

  // True when any descendant of `node` (children filtered to visible ones by
  // filterVisibleNodes) is an active selection — used to render the drill-in
  // arrow selected, so a collapsed parent signals a selection lives inside it.
  function hasSelectedDescendant(node: TagNode): boolean {
    for (const child of node.children) {
      if (activeSelections.has(child.value) || hasSelectedDescendant(child)) return true;
    }
    return false;
  }

  // The panel is a DOM descendant of `.stack-card-body`, which is
  // `overflow: hidden` for the expand/collapse grid animation. An
  // absolutely-positioned panel gets clipped at the card body's bottom edge,
  // which on a short (little-content) page sits right around the footer — so
  // the dropdown appeared cut off. `position: fixed` escapes that clip
  // (no transformed ancestors create a containing block in any state where
  // this panel can open), and we anchor it to the trigger button here. The
  // panel stays a DOM child of `.fp-dimension-controls`, so FilterBar's
  // click-outside detection and CardStack's delegated lens-replacement clicks
  // are unaffected.
  let panelEl: HTMLDivElement;

  function anchorPanel() {
    if (!panelEl) return;
    const wrapper = panelEl.closest('.fp-dim-wrapper');
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    // Overlap the button's bottom border, matching the old
    // `top: calc(100% - 1em - 1px)` connected look.
    const em = parseFloat(getComputedStyle(panelEl).fontSize) || 16;
    const top = rect.bottom - em - 1;
    const gutter = 8;
    panelEl.style.top = `${top}px`;
    // Cap height to the space between the panel top and the viewport bottom so
    // the panel never runs past the viewport/footer; the list scrolls within.
    panelEl.style.maxHeight = `${Math.max(120, window.innerHeight - top - gutter)}px`;
    // Anchor to the button's left edge, then clamp so a right-hand dimension
    // doesn't push the panel off-screen.
    panelEl.style.left = '0px';
    const width = panelEl.offsetWidth;
    let left = rect.left;
    if (left + width > window.innerWidth - gutter) {
      left = Math.max(gutter, window.innerWidth - gutter - width);
    }
    panelEl.style.left = `${left}px`;
  }

  onMount(() => {
    anchorPanel();
    const onScroll = () => anchorPanel();
    // capture:true so scrolls in any scrollable ancestor reposition the panel.
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions);
      window.removeEventListener('resize', onScroll);
    };
  });

  // Reposition when the content height changes (drilling in/out toggles the
  // header), so the height cap stays correct.
  $effect(() => {
    void sections;
    void drillPath;
    anchorPanel();
  });
</script>

<div
  bind:this={panelEl}
  class="browse-dim-panel"
  role="dialog"
  aria-label="{dimensionLabel} tag browser"
>

  {#if drillPath.length > 0 || isDimensionActive}
    <div class="browse-dim-panel-header">
        {#if drillPath.length > 0}
        <button
            class="browse-dim-back"
            onclick={onDrillBack}
            aria-label="Go back"
        >
            ← Back
        </button>
        <span class="browse-dim-panel-title">{drillTitle}</span>
        {/if}
        {#if isDimensionActive}
        <button
            class="browse-dim-clear"
            onclick={onClear}
            aria-label="Clear {dimensionLabel} filters"
        >
            Clear
        </button>
        {/if}
    </div>
  {/if}

  {#if lenses.length > 0 && drillPath.length == 0}
    <ul class="browse-dim-lenses" aria-label="{dimensionLabel} lenses">
      {#each lenses as lens}
        {@const lensSelected = lens.id === activeLensId}
        <li>
          <button
            class="browse-dim-lens-item"
            class:browse-dim-lens-item--selected={lensSelected}
            aria-current={lensSelected ? 'true' : undefined}
            data-replace-slot={lensUid(lens.id)}
            data-replace-params={lens.acceptsFilters ? carryFilterParams : ''}
            onclick={() => onSelectLens(lens.id)}
            aria-label="View through the {lens.label} lens"
          >
            {#if lens.icon}<LensIcon name={lens.icon} />{/if}
            <span class="browse-dim-lens-label">{lens.label}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <ul class="browse-dim-list" role="listbox" aria-multiselectable="true">
    {#each sections as section, si}
      {#if si > 0}
        <li class="browse-dim-section-divider" role="presentation" aria-hidden="true"></li>
      {/if}
      {#each section.nodes as node}
        {#if node.drillOnly}
          <!-- Pure container (e.g. the dev Status facet): the row has no filter
               meaning of its own, so the whole row drills in. Reads selected
               when a selection lives inside it, matching a collapsed parent. -->
          {@const childSelected = hasSelectedDescendant(node)}
          <li
            class="browse-dim-item"
            class:browse-dim-item--selected={childSelected}
            role="option"
            aria-selected={childSelected}
          >
            <button
              class="browse-dim-item-btn"
              onclick={() => onDrillInto(node)}
              aria-label="Explore {node.name}{childSelected ? ' (contains a selection)' : ''}"
            >
              <span class="browse-dim-item-label">{node.name}</span>
              <span class="browse-dim-drill-affordance" aria-hidden="true">›</span>
            </button>
          </li>
        {:else}
        {@const selected = activeSelections.has(node.value)}
        <li
          class="browse-dim-item"
          class:browse-dim-item--selected={selected}
          role="option"
          aria-selected={selected}
        >
          <button
            class="browse-dim-item-btn"
            onclick={() => onSelectValue(node.value)}
            aria-label="{node.name} ({node.count} cards)"
          >
            <span class="browse-dim-item-label">{node.name}</span>
            <span class="browse-dim-item-count">({node.count})</span>
          </button>
          {#if node.children.length > 0}
            {@const childSelected = hasSelectedDescendant(node)}
            <button
              class="browse-dim-drill"
              class:browse-dim-drill--selected={childSelected}
              onclick={(e) => { e.stopPropagation(); onDrillInto(node); }}
              aria-label="Explore subcategories of {node.label}{childSelected ? ' (contains a selection)' : ''}"
            >
              ›
            </button>
          {/if}
        </li>
        {/if}
      {/each}
    {/each}
    {#if sections.length === 0}
      <li class="browse-dim-empty">No tags available</li>
    {/if}
  </ul>
</div>

<style>
  .browse-dim-panel {
    /* fixed (not absolute) so the panel escapes the `overflow: hidden` on the
       ancestor `.stack-card-body`; top/left/max-height are set in JS
       (anchorPanel) from the trigger button's rect. */
    position: fixed;
    top: 0;
    left: 0;
    min-width: 220px;
    display: flex;
    flex-direction: column;
    border: var(--border-width) solid var(--color-border);
    background: var(--color-surface);
    z-index: 100;
    box-shadow: 4px 4px 0 var(--color-border);
  }

  .browse-dim-panel-header {
    flex: 0 0 auto;
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
    text-align: right;
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

  .browse-dim-lenses {
    flex: 0 0 auto;
    list-style: none;
    margin: 0;
    padding: 0;
    border-bottom: 1px solid var(--color-border-light);
  }

  /* Full-bleed rows: every row's highlight (hover and selected alike) is the
     whole row, so spacing must be static and gap-free in all states. The
     global `li { margin-bottom }` (global.css) and the list paddings are the
     only gap sources; zero them here so rows touch each other, the section
     dividers, and the panel edges. Nothing about spacing is conditional on
     selection, so selecting never shifts the layout. */
  .browse-dim-lenses > li {
    margin: 0;
  }

  .browse-dim-lens-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-sm);
    border: none;
    background: transparent;
    color: var(--color-text);
    cursor: pointer;
    text-align: left;
    font-family: var(--font-ui);
    font-size: 0.9rem;
  }

  .browse-dim-lens-item:hover {
    background: var(--color-bg-hover);
  }

  /* Active lens reads selected, mirroring an active tag
     (.browse-dim-item--selected). */
  .browse-dim-lens-item--selected {
    background: var(--color-text);
    color: var(--color-surface);
  }

  .browse-dim-lens-item--selected:hover {
    background: var(--color-text);
    opacity: 0.85;
  }

  .browse-dim-lens-label {
    font-weight: 600;
  }

  .browse-dim-list {
    list-style: none;
    margin: 0;
    padding: 0;
    /* Flex child of the panel: takes the remaining capped height and scrolls,
       so the header/lens list stay pinned while the tag list scrolls. */
    flex: 1 1 auto;
    min-height: 0;
    max-height: 320px;
    overflow-y: auto;
  }

  /* Divider between two tag sections — the only visible separator; group names
     are not shown. */
  .browse-dim-section-divider {
    height: 0;
    margin: 0;
    border-top: 1px solid var(--color-border-light);
  }

  .browse-dim-item {
    margin: 0;
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
    padding: var(--space-sm) var(--space-sm);
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

  /* Right-aligned drill glyph for a drillOnly row (the whole row is the drill
     button, so there's no separate .browse-dim-drill control). */
  .browse-dim-drill-affordance {
    margin-left: auto;
    color: var(--color-text-muted);
    font-size: 1.1rem;
    line-height: 1;
  }

  .browse-dim-item--selected .browse-dim-drill-affordance {
    color: var(--color-surface);
  }

  .browse-dim-drill {
    padding: var(--space-sm) var(--space-sm);
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

  /* A collapsed parent with a selected descendant reads selected, matching
     the selected-tag treatment (.browse-dim-item--selected). */
  .browse-dim-drill--selected {
    background: var(--color-text);
    color: var(--color-surface);
    border-left-color: var(--color-text);
  }

  .browse-dim-drill--selected:hover {
    background: var(--color-text);
    color: var(--color-surface);
    opacity: 0.85;
  }

  .browse-dim-empty {
    margin: 0;
    padding: var(--space-sm) var(--space-md);
    color: var(--color-text-muted);
    font-size: 0.9rem;
    font-style: italic;
  }
</style>
