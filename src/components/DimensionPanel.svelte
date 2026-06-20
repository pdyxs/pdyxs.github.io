<script lang="ts">
  import type { TagNode } from '../lib/browse-helpers';

  interface Props {
    dimensionLabel: string;
    drillPath: string[];
    currentNodes: TagNode[];
    activeSelections: Set<string>;
    isDimensionActive: boolean;
    onSelectValue: (value: string) => void;
    onDrillInto: (node: TagNode) => void;
    onDrillBack: () => void;
    onClear: () => void;
  }

  let {
    dimensionLabel,
    drillPath,
    currentNodes,
    activeSelections,
    isDimensionActive,
    onSelectValue,
    onDrillInto,
    onDrillBack,
    onClear,
  }: Props = $props();
</script>

<div
  class="browse-dim-panel"
  role="dialog"
  aria-label="{dimensionLabel} tag browser"
>
  <div class="browse-dim-panel-header">
    {#if drillPath.length > 0}
      <button
        class="browse-dim-back"
        onclick={onDrillBack}
        aria-label="Go back"
      >
        ← Back
      </button>
    {:else}
      <span class="browse-dim-panel-title">{dimensionLabel}</span>
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

  <ul class="browse-dim-list" role="listbox" aria-multiselectable="true">
    {#each currentNodes as node}
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
          aria-label="{node.label} ({node.count} cards)"
        >
          <span class="browse-dim-item-label">{node.label}</span>
          <span class="browse-dim-item-count">({node.count})</span>
        </button>
        {#if node.children.length > 0}
          <button
            class="browse-dim-drill"
            onclick={(e) => { e.stopPropagation(); onDrillInto(node); }}
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

<style>
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
</style>
