<script lang="ts">
  import { onMount } from 'svelte';
  import { stackFromParams, buildCardUrl } from '../lib/browse-stack';

  interface CardRef {
    uid: string;
    title: string;
  }

  interface Props {
    cards: CardRef[];
  }

  let { cards }: Props = $props();

  let stackUids = $state<string[]>([]);

  const cardsByUid = $derived(new Map(cards.map(c => [c.uid, c])));

  const stackEntries = $derived(
    stackUids
      .map((uid, i) => {
        const card = cardsByUid.get(uid);
        return card ? { uid, title: card.title, index: i } : null;
      })
      .filter((e): e is { uid: string; title: string; index: number } => e !== null)
  );

  onMount(() => {
    stackUids = stackFromParams(new URLSearchParams(window.location.search));
  });
</script>

{#if stackEntries.length > 0}
  <nav class="browse-stack" aria-label="Navigation stack">
    {#each stackEntries as entry, i (entry.uid)}
      {#if i > 0}
        <span class="browse-stack-sep" aria-hidden="true">›</span>
      {/if}
      <a
        class="browse-stack-entry"
        href={buildCardUrl(stackUids, entry.index)}
      >
        {entry.title}
      </a>
    {/each}
  </nav>
{/if}

<style>
  .browse-stack {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-sm) 0;
    border-bottom: var(--border-width) solid var(--color-border);
    font-family: var(--font-heading);
    font-size: 0.85rem;
  }

  .browse-stack-sep {
    color: var(--color-text-muted);
    user-select: none;
  }

  .browse-stack-entry {
    color: var(--color-text);
    text-decoration: none;
    padding: 2px var(--space-xs);
    border: var(--border-width) solid var(--color-border);
    transition: background-color 150ms ease;
  }

  .browse-stack-entry:hover {
    background: var(--color-bg-hover);
    text-decoration: none;
  }
</style>
