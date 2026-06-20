<script lang="ts">
  import type { SerialisedCard } from '../lib/browse-helpers';

  interface Props {
    card: SerialisedCard;
  }

  let { card }: Props = $props();
</script>

<li class="browse-card-item" data-push-card={card.uid}>
  <div class="browse-card-header">
    <p class="browse-card-title">{card.title}</p>
    {#if card.date}
      <time
        class="browse-card-date"
        datetime={new Date(card.date).toISOString()}
      >
        {new Date(card.date).toLocaleDateString('en-AU', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })}
      </time>
    {/if}
  </div>
  {#if card.description}
    <p class="browse-card-desc">{card.description}</p>
  {/if}
  {#if card.tags.length > 0}
    <ul class="browse-card-tags" aria-label="Tags">
      {#each card.tags as tag}
        <li class="browse-card-tag">{tag}</li>
      {/each}
    </ul>
  {/if}
</li>

<style>
  .browse-card-item {
    border: var(--border-width) solid var(--color-border);
    padding: var(--space-md);
    cursor: pointer;
    background: var(--color-surface);
    transition: background 0.1s;
  }

  .browse-card-item:hover {
    background: var(--color-bg-hover);
  }

  .browse-card-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-sm);
    margin-bottom: var(--space-xs);
  }

  .browse-card-title {
    font-family: var(--font-heading);
    font-size: 1rem;
    margin: 0;
  }

  .browse-card-date {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .browse-card-desc {
    font-size: 0.85rem;
    color: var(--color-text-muted);
    margin: 0 0 var(--space-xs);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .browse-card-tags {
    list-style: none;
    margin: var(--space-xs) 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .browse-card-tag {
    font-size: 0.7rem;
    font-family: var(--font-ui);
    padding: 1px 6px;
    border: 1px solid var(--color-border-light);
    color: var(--color-text-muted);
  }
</style>
