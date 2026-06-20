<script lang="ts">
  interface Props {
    label: string;
    isActive: boolean;
    isOpen: boolean;
    hasNodes: boolean;
    selectionCount: number;
    onToggle: () => void;
  }

  let { label, isActive, isOpen, hasNodes, selectionCount, onToggle }: Props = $props();
</script>

<button
  class="browse-dim-btn"
  class:browse-dim-btn--active={isActive}
  class:browse-dim-btn--open={isOpen}
  onclick={onToggle}
  aria-pressed={isOpen}
  aria-label="{label} filter{isActive ? ' (active)' : ''}"
  disabled={!hasNodes}
  title={hasNodes ? undefined : 'No tags available for this dimension'}
>
  {label}
  {#if isActive}
    <span class="browse-dim-badge" aria-hidden="true">{selectionCount}</span>
  {/if}
</button>

<style>
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
</style>
