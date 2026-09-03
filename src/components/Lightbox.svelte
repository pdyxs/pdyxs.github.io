<script lang="ts">
  // The full-screen viewer, shared by every surface that opens one: the gallery
  // strip (ImageGallery.svelte) and the images a card's body renders inline
  // (InlineImageViewer.svelte). It owns the overlay, the keyboard map and the
  // prev/next wrap; the caller owns what the set is and how it gets opened.
  import { autoplayEmbedUrl, EMBED_IFRAME_ALLOW } from '../lib/embeds';

  export interface LightboxItem {
    /** Iframe URL for an embed; the media URL otherwise. */
    full: string;
    kind: 'image' | 'video' | 'embed';
    alt?: string;
  }

  interface Props {
    items: LightboxItem[];
    /** Index of the open item, or null for closed. Bound, so the caller opens by setting it. */
    openIndex: number | null;
  }

  let { items, openIndex = $bindable() }: Props = $props();

  function close() {
    openIndex = null;
  }

  function next() {
    if (openIndex === null) return;
    openIndex = (openIndex + 1) % items.length;
  }

  function prev() {
    if (openIndex === null) return;
    openIndex = (openIndex - 1 + items.length) % items.length;
  }

  /**
   * Moves the overlay out to <body> for as long as it is open.
   *
   * The viewer is `position: fixed`, and it mounts inside the card that owns
   * the images — which on desktop is `#card-stack .stack-card`, carrying
   * `clip-path: inset(...)` (global.css, the ahead-fan crop). A clip-path
   * clips fixed-position descendants too, so left in place the "full-screen"
   * overlay was cropped to the active card's box. That rule cannot go: the
   * identity inset on every card is what the ahead crop animates from.
   *
   * Svelte's scoped-style classes are on the nodes themselves, so they survive
   * the move; the CSS variables it reads are all on `:root`.
   *
   * The standing rule this encodes: nothing `position: fixed` may live inside
   * `.stack-card` and be visible at desktop.
   */
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  function onKeydown(e: KeyboardEvent) {
    if (openIndex === null) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if openIndex !== null && items[openIndex]}
  <div
    use:portal
    class="image-gallery-lightbox"
    role="dialog"
    aria-modal="true"
    aria-label="Image viewer"
    tabindex="-1"
  >
    <button type="button" class="image-gallery-backdrop" onclick={close} aria-label="Close image viewer"></button>
    <button type="button" class="image-gallery-close" onclick={close} aria-label="Close">×</button>
    {#if items.length > 1}
      <button
        type="button"
        class="image-gallery-nav image-gallery-nav--prev"
        onclick={prev}
        aria-label="Previous image"
      >‹</button>
    {/if}
    {#if items[openIndex].kind === 'embed'}
      <iframe
        class="image-gallery-full image-gallery-embed"
        src={autoplayEmbedUrl(items[openIndex].full)}
        title="Video"
        allow={EMBED_IFRAME_ALLOW}
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
        frameborder="0"
      ></iframe>
    {:else if items[openIndex].kind === 'video'}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video class="image-gallery-full" src={items[openIndex].full} controls autoplay></video>
    {:else}
      <img class="image-gallery-full" src={items[openIndex].full} alt={items[openIndex].alt ?? ''} />
    {/if}
    {#if items.length > 1}
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
