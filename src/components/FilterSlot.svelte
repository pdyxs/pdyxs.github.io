<script lang="ts">
  import type { SerialisedCardFull } from '../lib/frontpage';

  interface Props {
    label: string;
    card: SerialisedCardFull | null;
    browseUrl: string;
  }

  let { label, card, browseUrl }: Props = $props();
</script>

<div class="fp-filter-slot">
  <p class="fp-slot-label">{label}</p>

  {#if card}
    <div
      class="card-link fp-slot-card"
      data-push-card={card.uid}
      role="button"
      tabindex="0"
    >
      <div class="card-header">
        <span class="card-header-title"><b>{card.title}</b></span>
      </div>
      {#if card.description}
        <p class="fp-slot-description">{card.description}</p>
      {/if}
    </div>
  {/if}

  <a class="fp-see-more" href={browseUrl}>See more →</a>
</div>

<style>
  .fp-filter-slot {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    padding: var(--space-md) 0;
  }

  .fp-slot-label {
    font-family: var(--font-heading);
    font-size: 0.75rem;
    font-weight: 400;
    letter-spacing: 0.1em;
    color: var(--color-text-muted);
    text-transform: uppercase;
    margin: 0;
    padding: 0 var(--space-lg);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-lg);
    font-family: var(--font-heading);
    font-size: 1.1rem;
    font-weight: 400;
    letter-spacing: 0.04em;
    color: var(--color-text);
    background: repeating-linear-gradient(
      to bottom,
      transparent 0px,
      transparent 18px,
      var(--color-bg-stripes) 19px,
      var(--color-bg-stripes) 20px
    );
    user-select: none;
  }

  .card-header-title {
    background: var(--color-surface);
    padding: 0 2px;
  }

  .fp-slot-card {
    cursor: pointer;
    display: block;
    text-decoration: none;
    width: 100%;
  }

  .fp-slot-card:hover .card-header {
    background: var(--color-bg-hover);
  }

  .fp-slot-description {
    padding: var(--space-sm) var(--space-lg);
    font-size: 0.9rem;
    color: var(--color-text-muted);
    margin: 0;
    border-top: 1px solid var(--color-border-light);
  }

  .fp-see-more {
    font-family: var(--font-ui);
    font-size: 0.85rem;
    color: var(--color-text-muted);
    text-decoration: none;
    align-self: flex-end;
    padding-right: var(--space-lg);
  }

  .fp-see-more:hover {
    color: var(--color-text);
    text-decoration: underline;
  }
</style>
