<script lang="ts">
  interface Props {
    uid: string;
    title: string;
  }

  let { uid, title }: Props = $props();
</script>

<div class="card-link fp-pinned" data-push-card={uid}>
  <div class="card-header">
    <span class="card-header-title"><b>{title}</b></span>
  </div>
</div>

<style>
  .fp-pinned {
    cursor: pointer;
    width: 100%;
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

  .fp-pinned:hover .card-header {
    background: var(--color-bg-hover);
  }
</style>
