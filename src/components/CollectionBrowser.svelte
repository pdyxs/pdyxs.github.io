<script lang="ts">
  import { onMount } from 'svelte';
  import { type TagOption, type CardDisplay, filterCardsByTag } from '../lib/collection-browser';

  interface Props {
    entries: CardDisplay[];
    availableTags: TagOption[];
    title: string;
    uid: string;
  }

  let { entries, availableTags, title, uid }: Props = $props();

  let activeFilter = $state<string | null>(null);
  const filteredEntries = $derived(filterCardsByTag(entries, activeFilter));

  function dispatchCardParam(filter: string | null) {
    document.dispatchEvent(new CustomEvent('cardparam', {
      bubbles: true,
      detail: { uid, params: { tag: filter } },
    }));
  }

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('tag')) {
      activeFilter = params.get('tag');
    } else {
      const allEntries = [
        ...(params.get('from')?.split(',') ?? []),
        ...(params.get('to')?.split(',') ?? []),
      ];
      const myEntry = allEntries.find(e => e.split(':')[0] === uid);
      if (myEntry) {
        const colonIdx = myEntry.indexOf(':');
        if (colonIdx !== -1) {
          activeFilter = new URLSearchParams(myEntry.slice(colonIdx + 1)).get('tag') ?? null;
        }
      }
    }
    if (activeFilter) dispatchCardParam(activeFilter);
  });

  function selectFilter(tagId: string) {
    activeFilter = activeFilter === tagId ? null : tagId;
    dispatchCardParam(activeFilter);
  }
</script>

{#if availableTags.length > 0}
  <div class="collection-filter-chips" role="group" aria-label="{title} filters">
    {#each availableTags as tag}
      <button
        class="collection-filter-chip"
        class:collection-filter-chip--active={activeFilter === tag.id}
        onclick={() => selectFilter(tag.id)}
      >
        {tag.name} ({tag.count})
      </button>
    {/each}
  </div>
{/if}

<ul class="card-listing">
  {#each filteredEntries as card}
    <li class="card-listing-item" data-push-card={card.uid}>
      <div class="card-listing-header">
        <p class="card-listing-title">{card.title}</p>
        {#if card.date}
          <time class="card-listing-date" datetime={card.date.toISOString()}>
            {card.date.toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' })}
          </time>
        {/if}
      </div>
      {#if card.description}
        <p class="card-listing-desc">{card.description}</p>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .collection-filter-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-lg);
  }

  .collection-filter-chip {
    font-family: var(--font-heading);
    font-size: 0.8rem;
    padding: 2px var(--space-sm);
    border: 1px solid var(--color-text);
    background: transparent;
    color: var(--color-text);
    cursor: pointer;
    border-radius: 2px;
  }

  .collection-filter-chip--active {
    background: var(--color-text);
    color: var(--color-surface);
  }

  .collection-filter-chip:hover:not(.collection-filter-chip--active) {
    background: var(--color-bg-stripes);
  }
</style>
