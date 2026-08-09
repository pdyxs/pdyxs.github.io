/**
 * Images the *body* renders inline — the ones someone wrote into their
 * markdown, as opposed to the card's masthead image or a gallery thumbnail.
 *
 * Astro's markdown wraps a lone image in a paragraph (`![](x.png)` →
 * `<p><img></p>`) and an image inside a list item in that `<li>`, so parent tag
 * is what separates a body image from the rest. This is a **selector contract**
 * shared by three places, and they must agree:
 *
 * - `global.css` — the `--inline-image-max-height` cap and the zoom cursor
 *   (the selector is written out there; CSS can't import it)
 * - `InlineImageViewer.svelte` — which clicks open the lightbox
 * - this module's `isInlineBodyImage`, which is the decision both share
 */
export const INLINE_BODY_IMAGE_SELECTOR = ':is(p, li) > img';

/** Everything the lightbox needs about one inline image. */
export interface InlineImage {
  src: string;
  alt: string;
}

/**
 * Whether a clicked element is a body image that should open the lightbox.
 *
 * Pure predicate over an element: no document lookups, no state. `root` scopes
 * it to one card's body, so a click in one card of the stack can't open another
 * card's viewer.
 */
export function isInlineBodyImage(target: EventTarget | null, root: Element): boolean {
  if (!(target instanceof Element)) return false;
  if (target.tagName !== 'IMG') return false;
  if (!root.contains(target)) return false;
  return target.matches(INLINE_BODY_IMAGE_SELECTOR);
}

/**
 * The full set of body images in a card, in document order — the lightbox's
 * prev/next runs over all of them, so opening one worked-example image lets you
 * step through the rest.
 *
 * `currentSrc` over `src`: an Astro-processed image ships a srcset, and the
 * resolution the browser actually chose is the one already decoded.
 */
export function collectInlineImages(root: ParentNode): InlineImage[] {
  return Array.from(root.querySelectorAll<HTMLImageElement>(INLINE_BODY_IMAGE_SELECTOR)).map(
    img => ({ src: img.currentSrc || img.src, alt: img.alt }),
  );
}

/**
 * Whether a card's markdown renders any image inline — the switch for mounting
 * the viewer island at all. Most cards have none, and an island that will never
 * fire is a script download for nothing.
 *
 * Matches a markdown image (`![alt](src)`) or a raw `<img`, which is every
 * shape the migrated content uses. Deliberately not exact: a false positive
 * mounts a listener that never fires, which is harmless; the cost of being
 * clever here is a card whose images silently don't open.
 */
export function bodyHasInlineImage(body: string | undefined): boolean {
  if (!body) return false;
  return /!\[[^\]]*\]\(/.test(body) || /<img[\s>]/i.test(body);
}
