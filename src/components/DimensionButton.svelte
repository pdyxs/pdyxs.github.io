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

  const dots = $derived(Array.from({ length: selectionCount }));
</script>

<button
  class="browse-dim-btn"
  class:browse-dim-btn--active={isActive}
  class:browse-dim-btn--open={isOpen}
  onclick={onToggle}
  aria-pressed={isOpen}
  aria-label="{label} filter{isActive ? ` (${selectionCount} active)` : ''}"
  disabled={!hasNodes}
  title={hasNodes ? undefined : 'No tags available for this dimension'}
>
  <span class="browse-dim-label">{label}</span>
  {#if isActive}
    <span class="browse-dim-dots" aria-hidden="true">
      {#each dots as _}
        <span class="browse-dim-dot"></span>
      {/each}
    </span>
  {/if}
</button>

<style>
  .browse-dim-btn {
    font-family: var(--font-heading);
    font-size: 1rem;
    border: var(--border-width) solid var(--color-border);
    background: transparent;
    color: var(--color-text);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    padding: 0;
    transition: background 0.15s;
  }

  .browse-dim-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .browse-dim-btn--open {
    border-bottom-color: transparent;
  }

  .browse-dim-label {
    padding: var(--space-xs) var(--space-md);
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .browse-dim-btn:not(:disabled):hover:not(.browse-dim-btn--active) .browse-dim-label {
    background: var(--color-bg-hover);
  }

  .browse-dim-dots {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 5px;
    padding: var(--space-xs) var(--space-md);
    background: var(--color-text);
  }

  .browse-dim-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--color-surface);
    flex-shrink: 0;
  }
</style>
