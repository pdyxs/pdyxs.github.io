<script lang="ts">
  interface Props {
    uid: string;
    title: string;
    description?: string;
  }

  let { uid, title, description }: Props = $props();
</script>

<div class="card-link fp-pinned" data-push-card={uid} role="button" tabindex="0">
  <div class="card-header">
    <span class="card-header-title"><b>{title}</b></span>
  </div>
  {#if description}
    <p class="fp-pinned-description">{description}</p>
  {/if}
</div>

<style>
  .fp-pinned {
    cursor: pointer;
    width: 100%;
    border: var(--border-width) solid var(--color-border);
    display: block;
    text-decoration: none;
  }

  .fp-pinned:hover .card-header {
    background: var(--color-bg-hover);
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

  .fp-pinned-description {
    padding: var(--space-sm) var(--space-lg);
    font-size: 0.9rem;
    color: var(--color-text-muted);
    margin: 0;
    border-top: 1px solid var(--color-border-light);
  }
</style>
