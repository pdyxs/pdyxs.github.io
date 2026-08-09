<script lang="ts">
  // Makes the images a card's body renders inline openable full-screen.
  //
  // Renders no UI of its own — it is a delegated click listener plus a
  // <Lightbox>. That's deliberate: the images belong to markdown Astro already
  // rendered, so there is nothing here to wrap them in. The set it opens is
  // every inline image in the card, in document order, so prev/next steps
  // through a worked example rather than dead-ending on the one you clicked.
  //
  // Scoped to its own card: the listener is attached to the enclosing
  // .stack-card-body-inner, not the document, so a click in one card of the
  // stack can never open another card's viewer.
  import { collectInlineImages, isInlineBodyImage } from '../lib/inline-images';
  import Lightbox from './Lightbox.svelte';
  import type { LightboxItem } from './Lightbox.svelte';

  let anchor = $state<HTMLElement | null>(null);
  let items = $state<LightboxItem[]>([]);
  let openIndex = $state<number | null>(null);

  $effect(() => {
    const root = anchor?.closest('.stack-card-body-inner');
    if (!root) return;

    function onClick(e: Event) {
      if (!isInlineBodyImage(e.target, root!)) return;
      const images = collectInlineImages(root!);
      const clicked = (e.target as HTMLImageElement).currentSrc || (e.target as HTMLImageElement).src;
      const index = images.findIndex(img => img.src === clicked);
      if (index === -1) return;
      items = images.map(img => ({ full: img.src, kind: 'image' as const, alt: img.alt }));
      openIndex = index;
    }

    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  });
</script>

<span bind:this={anchor} hidden></span>

<Lightbox {items} bind:openIndex />
