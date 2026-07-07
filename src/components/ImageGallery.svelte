<script lang="ts">
  interface GalleryImage {
    thumb: string;
    full: string;
    kind: 'image' | 'video';
  }

  interface Props {
    images: GalleryImage[];
  }

  let { images }: Props = $props();

  let openIndex = $state<number | null>(null);

  function open(i: number) {
    openIndex = i;
  }

  function close() {
    openIndex = null;
  }

  function next() {
    if (openIndex === null) return;
    openIndex = (openIndex + 1) % images.length;
  }

  function prev() {
    if (openIndex === null) return;
    openIndex = (openIndex - 1 + images.length) % images.length;
  }

  function onKeydown(e: KeyboardEvent) {
    if (openIndex === null) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="image-gallery">
  {#each images as img, i}
    <button
      type="button"
      class="image-gallery-thumb"
      onclick={() => open(i)}
      aria-label="View item {i + 1} of {images.length}"
    >
      {#if img.kind === 'video'}
        <video src={img.thumb} muted preload="metadata" class="image-gallery-thumb-video"></video>
      {:else}
        <img src={img.thumb} alt="" loading="lazy" />
      {/if}
    </button>
  {/each}
</div>

{#if openIndex !== null}
  <div
    class="image-gallery-lightbox"
    role="dialog"
    aria-modal="true"
    aria-label="Image viewer"
    tabindex="-1"
  >
    <button type="button" class="image-gallery-backdrop" onclick={close} aria-label="Close image viewer"></button>
    <button type="button" class="image-gallery-close" onclick={close} aria-label="Close">×</button>
    {#if images.length > 1}
      <button
        type="button"
        class="image-gallery-nav image-gallery-nav--prev"
        onclick={prev}
        aria-label="Previous image"
      >‹</button>
    {/if}
    {#if images[openIndex].kind === 'video'}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video class="image-gallery-full" src={images[openIndex].full} controls autoplay></video>
    {:else}
      <img class="image-gallery-full" src={images[openIndex].full} alt="" />
    {/if}
    {#if images.length > 1}
      <button
        type="button"
        class="image-gallery-nav image-gallery-nav--next"
        onclick={next}
        aria-label="Next image"
      >›</button>
    {/if}
  </div>
{/if}

<style>
  .image-gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: var(--space-xs);
    margin-bottom: var(--space-lg);
  }

  .image-gallery-thumb {
    padding: 0;
    border: var(--border-width) solid var(--color-border);
    background: none;
    cursor: pointer;
    aspect-ratio: 1 / 1;
    overflow: hidden;
  }

  .image-gallery-thumb img,
  .image-gallery-thumb-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .image-gallery-lightbox {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: var(--color-overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-lg);
  }

  .image-gallery-backdrop {
    position: absolute;
    inset: 0;
    z-index: 0;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }

  .image-gallery-full {
    position: relative;
    z-index: 1;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border: var(--border-width) solid var(--color-border);
  }

  .image-gallery-close {
    position: absolute;
    z-index: 1;
    top: var(--space-md);
    right: var(--space-md);
    font-family: var(--font-ui);
    font-size: 1.5rem;
    line-height: 1;
    color: var(--color-surface);
    background: none;
    border: none;
    cursor: pointer;
    padding: var(--space-xs);
  }

  .image-gallery-nav {
    position: absolute;
    z-index: 1;
    top: 50%;
    transform: translateY(-50%);
    font-family: var(--font-ui);
    font-size: 2.5rem;
    line-height: 1;
    color: var(--color-surface);
    background: none;
    border: none;
    cursor: pointer;
    padding: var(--space-sm);
  }

  .image-gallery-nav--prev {
    left: var(--space-sm);
  }

  .image-gallery-nav--next {
    right: var(--space-sm);
  }
</style>
