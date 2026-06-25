<script lang="ts">
  import type { ResolvedSlot } from '../lib/frontpage';
  import PinnedSlot from './PinnedSlot.svelte';
  import FilterSlot from './FilterSlot.svelte';

  interface Props {
    slots: ResolvedSlot[];
  }

  let { slots }: Props = $props();
</script>

<div class="front-page-slots">
  {#each slots as slot (slot.type === 'pinned' ? slot.uid : slot.label)}
    {#if slot.type === 'pinned'}
      <PinnedSlot uid={slot.uid} title={slot.title} />
    {:else}
      <FilterSlot label={slot.label} card={slot.card} browseUrl={slot.browseUrl} />
    {/if}
  {/each}
</div>

<style>
  .front-page-slots {
    display: flex;
    flex-direction: column;
    gap: 0;
    border: var(--border-width) solid var(--color-border);
  }

  .front-page-slots > :not(:first-child) {
    border-top: var(--border-width) solid var(--color-border);
  }
</style>
