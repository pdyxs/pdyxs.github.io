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

  /* Card headers sit at L2 already, so hover steps up to the strong level. */
  .fp-pinned:hover .card-header {
    background: var(--color-bg-hover-strong);
  }

  .fp-pinned-description {
    padding: var(--space-sm) var(--space-lg);
    font-size: 0.9rem;
    color: var(--color-text-muted);
    margin: 0;
    border-top: 1px solid var(--color-border-light);
  }
</style>
