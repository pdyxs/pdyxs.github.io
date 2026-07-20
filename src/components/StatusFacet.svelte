<script lang="ts">
  // Dev-only publish-lifecycle facet (issue #52). Unlike the 5W dimension
  // buttons (DimensionButton/DimensionPanel), status is not derived from the
  // tag registry and has no hierarchy to drill into — it's a hardcoded set
  // of chips (STATUS_VALUES) rendered flat, always visible when open.
  //
  // Gated entirely behind `import.meta.env.DEV`: Vite/esbuild statically
  // resolve this at build time, so a production build dead-code-eliminates
  // this whole block (and, since nothing else imports this component,
  // usually the component itself) — the facet and its chips never reach
  // production output. It composes with 5W selections purely through
  // FilterState.status (see filters.ts's applyFilters), which the parent
  // wires up the same way it wires 5W dimension toggles.
  import { STATUS_VALUES } from '../lib/status-visibility';
  import type { StatusValue } from '../lib/status-visibility';

  interface Props {
    activeStatus?: StatusValue;
    onSelect: (value: StatusValue) => void;
  }

  let { activeStatus, onSelect }: Props = $props();
</script>

{#if import.meta.env.DEV}
  <div class="fp-status-facet" role="toolbar" aria-label="Status filter (dev only)">
    {#each STATUS_VALUES as status}
      {@const selected = activeStatus === status}
      <button
        type="button"
        class="fp-status-chip"
        class:fp-status-chip--selected={selected}
        aria-pressed={selected}
        onclick={() => onSelect(status)}
      >
        {status}
      </button>
    {/each}
  </div>
{/if}

<style>
  .fp-status-facet {
    justify-content: center;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    padding: var(--space-xs) 0;
    background: var(--color-text);
  }

  .fp-status-chip {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    padding: 2px var(--space-sm);
    border: 1px solid var(--color-border);
    background: var(--color-bg);
    color: var(--color-text);
    cursor: pointer;
  }

  .fp-status-chip:hover {
    background: var(--color-bg-hover);
  }

  .fp-status-chip--selected {
    background: var(--color-text);
    color: var(--color-surface);
    border: 1px solid var(--color-bg);
  }

  .fp-status-chip--selected:hover {
    opacity: 0.85;
  }
</style>
