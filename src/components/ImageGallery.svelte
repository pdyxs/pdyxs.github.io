<script lang="ts">
  import { autoplayEmbedUrl, EMBED_IFRAME_ALLOW } from '../lib/embeds';

  interface GalleryImage {
    /** Poster URL for an embed — empty when the provider had none. */
    thumb: string;
    /** Iframe URL for an embed; the media URL otherwise. */
    full: string;
    kind: 'image' | 'video' | 'embed';
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
      {:else if img.kind === 'embed'}
        <!-- Facade: the poster stands in until a click, so no third-party
             player script loads for a card nobody opens a video on. -->
        {#if img.thumb}
          <img src={img.thumb} alt="" loading="lazy" />
        {:else}
          <span class="image-gallery-thumb-placeholder">Video</span>
        {/if}
        <span class="image-gallery-play" aria-hidden="true">▶</span>
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
    {#if images[openIndex].kind === 'embed'}
      <iframe
        class="image-gallery-full image-gallery-embed"
        src={autoplayEmbedUrl(images[openIndex].full)}
        title="Video"
        allow={EMBED_IFRAME_ALLOW}
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
        frameborder="0"
      ></iframe>
    {:else if images[openIndex].kind === 'video'}
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
    position: relative;
  }

  /* Play badge over an embed facade. Ink-on-paper (inverted by data-theme like
     everything else) rather than a provider colour — it has to read over an
     arbitrary full-colour poster in both themes. */
  .image-gallery-play {
    position: absolute;
    inset: 0;
    margin: auto;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-ui);
    font-size: 0.85rem;
    line-height: 1;
    color: var(--color-text);
    background: var(--color-bg);
    border: var(--border-width) solid var(--color-text);
    pointer-events: none;
  }

  .image-gallery-thumb-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    font-family: var(--font-ui);
    font-size: 0.75rem;
    color: var(--color-text-muted);
    background: var(--color-surface);
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

  /* An iframe has no intrinsic size for object-fit to work against, so the
     player is sized explicitly and held at 16:9. */
  .image-gallery-embed {
    width: min(100%, 1200px);
    height: auto;
    aspect-ratio: 16 / 9;
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
