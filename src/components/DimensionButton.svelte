<script lang="ts">
  interface Props {
    label: string;
    isActive: boolean;
    isOpen: boolean;
    hasNodes: boolean;
    selectionCount: number;
    onToggle: () => void;
    /** Icon of the currently active lens filed under this dimension, if any.
     * Undefined means no lens is active here — at most one dimension button
     * across the bar shows an icon at a time (see activeLensIcon()). */
    lensIcon?: string;
  }

  let { label, isActive, isOpen, hasNodes, selectionCount, onToggle, lensIcon }: Props = $props();

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
  {#if lensIcon}
    <span class="browse-dim-lens-icon" aria-hidden="true">{lensIcon}</span>
  {/if}
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

  .browse-dim-lens-icon {
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 0.85em;
    line-height: 1;
    padding-top: var(--space-xs);
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
