<script lang="ts">
  import { lensIconMarkup } from '../lib/lens-icons';

  interface Props {
    /** Lens icon key from the registry (see lens-icons.ts). */
    name: string | undefined | null;
  }

  let { name }: Props = $props();

  // SVG markup only — no <script>, so {@html} is safe here. currentColor lets
  // the icon inherit the surrounding text colour.
  const markup = $derived(lensIconMarkup(name));
</script>

{#if markup}
  <span class="lens-icon" aria-hidden="true">{@html markup}</span>
{/if}

<style>
  .lens-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
  }
</style>
