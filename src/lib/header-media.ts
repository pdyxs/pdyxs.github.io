/**
 * Header-media islands: what a card shows *instead of* the plain `<img>` at the
 * top of `.generic-bleed`.
 *
 * The rest of GenericRenderer is untouched — masthead, dateline, credits, body,
 * gallery and the card strips all still run. This is deliberately a slot rather
 * than a card renderer: a dedicated renderer starts as "the one thing this card
 * does differently" and then silently lacks everything GenericRenderer grows
 * afterwards (see the WorkRenderer note in CLAUDE.md / renderers.ts).
 *
 * Registration is in HEADER_MEDIA_RENDERERS (src/lib/renderers.ts). An
 * unregistered name is not an error — the card falls back to its ordinary
 * `image:` header — so check the spelling if nothing changes.
 */

/** One of the card's colocated images, pre-resolved through astro:assets. */
export interface HeaderMediaImage {
  /** Filename relative to the card directory, e.g. "lino-2.jpg". */
  filename: string;
  /** Optimised URL, ready for `<img src>`. */
  src: string;
  /** Intrinsic dimensions of the optimised image — lay the canvas out with these. */
  width: number;
  height: number;
}

/** Props every header-media island receives. */
export interface HeaderMediaProps {
  /** `collection/id` — the card's uid, if the island needs to key anything. */
  entryId: string;
  /** Every colocated image, filename-sorted. Unfiltered: the island decides. */
  images: HeaderMediaImage[];
}
