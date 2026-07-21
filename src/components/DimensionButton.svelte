<script lang="ts">
  import LensIcon from './LensIcon.svelte';

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

<!-- The button and its indicator strips are siblings (not nested) so the
     strips can be positioned against the shared `.fp-dim-wrapper` box rather
     than computed off the button's padding box — see the strip CSS below. -->
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
</button>
{#if lensIcon}
  <span class="browse-dim-lens-icon" aria-hidden="true">
    <LensIcon name={lensIcon} />
  </span>
{/if}
{#if isActive}
  <span class="browse-dim-dots" aria-hidden="true">
    {#each dots as _}
      <span class="browse-dim-dot"></span>
    {/each}
  </span>
{/if}

<style>
  .browse-dim-btn {
    font-family: var(--font-heading);
    font-size: 1rem;
    border: var(--border-width) solid var(--color-border);
    background: transparent;
    color: var(--color-text);
    cursor: pointer;
    display: flex;
    align-items: stretch;
    padding: 0;
    /* Vertical space for the indicator strips is reserved by the wrapper's
       padding (see .fp-dim-wrapper in FilterBar), not a button margin, so the
       strips can anchor to the wrapper's padding box. */
    margin: 0;
    transition: background 0.15s;
  }

  .browse-dim-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .browse-dim-btn--open {
    border-bottom-color: transparent;
  }

  /* The indicator strips hang above (lens) and below (dots) the button,
     out of flow, so every dimension button keeps the same height/position
     whether or not an indicator is present. They are siblings of the button
     and positioned against the shared `.fp-dim-wrapper` — whose padding box
     edges ARE the button's border-box edges (the button is width:100% with no
     horizontal margin). So `left/right: 0` puts the strip flush with the
     button using the *same* raw coordinate, no `± border-width` arithmetic.

     Why this matters on Firefox: at fractional (flex-distributed) button
     widths, Firefox snaps a background fill outward to cover but snaps a
     border to a crisp line, and it snaps an intermediate offset origin (the
     old `padding-box − border-width`) to a different device pixel than the
     button's own border. Two fixes together make the edges land identically:
       1. left/right: 0 against the wrapper — no arithmetic, same coordinate.
       2. the left/right edges are BORDERS matching the button's border, so
          both snap by the crisp-line rule (not fill-cover).
     The vertical `... - var(--border-width)` overlaps the strip one border
     width into the button so the fill's snapped inner edge never leaves a gap.
     `--dim-indicator-reserve` is the wrapper's vertical padding. */
  .browse-dim-lens-icon {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(100% - var(--dim-indicator-reserve) - var(--border-width));
    border-left: var(--border-width) solid var(--color-border);
    border-right: var(--border-width) solid var(--color-border);
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 0.85em;
    line-height: 1;
    /* The strip is an inverted surface like any selected control, so it takes
       the shared treatment: the icon draws in currentColor and reads as paper
       on ink. See --color-selected-* in global.css. */
    background: var(--color-selected-bg);
    color: var(--color-selected-fg);
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

  /* Mirror of .browse-dim-lens-icon, hung below the button. See that rule's
     comment for the full rationale (wrapper-relative left/right, matching
     side borders, one-border-width overlap into the button). */
  .browse-dim-dots {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(100% - var(--dim-indicator-reserve) - var(--border-width));
    border-left: var(--border-width) solid var(--color-border);
    border-right: var(--border-width) solid var(--color-border);
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 5px;
    padding: var(--space-xs) var(--space-md);
    background: var(--color-selected-bg);
    pointer-events: none;
  }

  .browse-dim-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--color-selected-fg);
    flex-shrink: 0;
  }
</style>
