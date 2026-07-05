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
    position: relative;
    font-family: var(--font-heading);
    font-size: 1rem;
    border: var(--border-width) solid var(--color-border);
    background: transparent;
    color: var(--color-text);
    cursor: pointer;
    display: flex;
    align-items: stretch;
    padding: 0;
    margin: 1em 0;
    transition: background 0.15s;
  }

  .browse-dim-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .browse-dim-btn--open {
    border-bottom-color: transparent;
  }

  /* Positioned outside the button's own border box (not part of its flow)
     so every dimension button stays the same height/vertical position
     regardless of whether an indicator is present. Offsetting by
     --border-width and insetting left/right by the same amount aligns
     this flush with the button's outer border edge instead of its padding
     edge (100% alone lands under the border, not below/above it). */
  .browse-dim-lens-icon {
    position: absolute;
    bottom: calc(100%);
    left: calc(-1 * var(--border-width) + 1px);
    right: calc(-1 * var(--border-width) + 1px);
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 0.85em;
    line-height: 1;
    background: var(--color-text);
    border-bottom: none;
    pointer-events: none;
  }

  .browse-dim-label {
    padding: var(--space-xs) var(--space-md);
    display: flex;
    flex-grow: 1;
    justify-content: center;
    align-items: center;
  }

  .browse-dim-btn:not(:disabled):hover .browse-dim-label {
    background: var(--color-bg-hover);
  }

  .browse-dim-dots {
    position: absolute;
    top: calc(100% + var(--border-width));
    left: calc(-1 * var(--border-width));
    right: calc(-1 * var(--border-width));
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 5px;
    padding: var(--space-xs) var(--space-md);
    background: var(--color-text);
    pointer-events: none;
  }

  .browse-dim-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--color-surface);
    flex-shrink: 0;
  }
</style>
