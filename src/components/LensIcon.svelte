<script lang="ts">
  import { lensIconDef } from '../lib/lens-icons';

  interface Props {
    /** Lens icon key from the registry (see lens-icons.ts). */
    name: string | undefined | null;
  }

  let { name }: Props = $props();

  // Real declarative SVG (no {@html}) so server and client renders match and
  // Svelte hydration stays quiet. currentColor lets the icon inherit the
  // surrounding text colour.
  const def = $derived(lensIconDef(name));
</script>

{#if def}
  <span class="lens-icon" aria-hidden="true">
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill={def.filled ? 'currentColor' : 'none'}
      stroke={def.filled ? 'none' : 'currentColor'}
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {#each def.shapes as s}
        {#if s.kind === 'circle'}
          <circle cx={s.cx} cy={s.cy} r={s.r} />
        {:else if s.kind === 'line'}
          <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
        {:else if s.kind === 'polyline'}
          <polyline points={s.points} />
        {/if}
      {/each}
    </svg>
  </span>
{/if}

<style>
  .lens-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
  }
</style>
