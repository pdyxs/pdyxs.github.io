<script lang="ts">
  // The thumbnail strip. The full-screen viewer it opens lives in
  // Lightbox.svelte, shared with the inline-image viewer.
  import Lightbox from './Lightbox.svelte';
  import type { LightboxItem } from './Lightbox.svelte';

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

  const items = $derived<LightboxItem[]>(
    images.map(img => ({ full: img.full, kind: img.kind }))
  );

  function open(i: number) {
    openIndex = i;
  }
</script>

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

<Lightbox {items} bind:openIndex />

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

</style>
