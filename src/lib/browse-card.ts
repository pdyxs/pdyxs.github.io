// The one place a CardMeta becomes a browse-card preview.
//
// Server-only (it imports astro:assets), which is why it lives here rather than
// in browse-helpers.ts — that module is framework-agnostic and ships into Svelte
// components. This is the thin IO shell around that pure module's types.
//
// Every preview in the site goes through this: the browse/newest/oldest lens
// pool (LensStackCard), the audit dashboard (AuditLensBody), and the
// "This is about" / "Cards about this" strips (GenericRenderer's routes). It
// used to be copy-pasted into the first two and simply missing from the third,
// which is why card previews on a card body rendered without their images.

import { getImage } from 'astro:assets';
import { resolveLocalImage, resolveLocalVideo, isRemoteImageUrl, isRemoteVideoUrl } from './images';
import { parseEmbedUrl, embedPosterUrl } from './embeds';
import type { CardMeta } from './cards';
import type { SerialisedCardFull } from './frontpage';

type Thumb = { thumb?: string; thumbSrcset?: string; thumbKind?: 'video' };

/**
 * Resolve a card's header `image` to a thumbnail.
 *
 * Local images go through astro:assets at two widths — a full-width mobile card
 * at 2x (720) down to a 3-up desktop column (360); the `sizes` attribute on
 * BrowseCard's <img> picks between them. A remote image is used as-is, but only
 * when the URL ends in a known image extension: the migrated content is full of
 * dead Jekyll-era embed and video links that would otherwise render as broken
 * images.
 *
 * A header `image` that is itself video — a colocated file (e.g. an
 * Instagram-era `.mp4`) or a remote video URL — has no frame grab to serve as
 * an `<img>`, so it's carried through as-is with `thumbKind: 'video'` and
 * rendered with `<video preload="metadata">`, which the browser paints with
 * the first frame for free (the same trick ImageGallery already relies on for
 * video gallery tiles). A header `image` that is a YouTube/Vimeo URL (rather
 * than a frame grab or a video file) falls back to that provider's poster, the
 * same one the gallery facade uses — otherwise a video-headed card has no
 * preview at all.
 */
async function resolveThumb(card: CardMeta): Promise<Thumb> {
  const localImage = resolveLocalImage(card.uid, card.image);
  if (localImage) {
    const generated = await getImage({ src: localImage, widths: [360, 720], format: 'webp' });
    return { thumb: generated.src, thumbSrcset: generated.srcSet.attribute };
  }
  if (card.image && isRemoteImageUrl(card.image)) {
    return { thumb: card.image };
  }
  const localVideo = resolveLocalVideo(card.uid, card.image);
  if (localVideo) {
    return { thumb: localVideo, thumbKind: 'video' };
  }
  if (card.image && isRemoteVideoUrl(card.image)) {
    return { thumb: card.image, thumbKind: 'video' };
  }
  const embed = parseEmbedUrl(card.image);
  if (embed) {
    const poster = embedPosterUrl(embed);
    if (poster) return { thumb: poster };
  }
  return {};
}

/**
 * Serialise one card into the browse-card payload.
 *
 * The field list is an explicit pick, never a spread of the card (see CLAUDE.md).
 * A spread skips excess-property checking, so build-time-only fields
 * (`visibility`, `image`) ship to the browser despite the type not
 * declaring them — and every field later added to CardMeta joins them. What
 * crosses the wire stays a decision.
 */
export async function serialiseBrowseCard(card: CardMeta): Promise<SerialisedCardFull> {
  const { thumb, thumbSrcset, thumbKind } = await resolveThumb(card);
  return {
    uid: card.uid,
    title: card.title,
    description: card.description,
    date: card.date?.toISOString() ?? null,
    tags: card.tags,
    renderer: card.renderer,
    collapsed: card.collapsed,
    status: card.status,
    // Required: every lens body declares `cards: SerialisedCardFull[]`, and
    // the ranking chain's unseen rung keys view-state on this hash.
    contentHash: card.contentHash,
    // The build-time rungs of the ranking chain (ranking.ts): the comparator
    // itself runs in the browser, since filter-match count and seen-ness are
    // only knowable there.
    priority: card.priority,
    sort: card.sort,
    // Rung 4, added deliberately (issue #90): `order` used to be build-time
    // only, and stayed off the payload after it joined the chain — so the
    // rung read `undefined` in the browser and never fired. Left absent when
    // the card declares none; rung 4 needs both cards to declare one.
    order: card.order,
    thumb,
    thumbSrcset,
    thumbKind,
  };
}

/** Serialise a list of cards, resolving their thumbnails concurrently. */
export function serialiseBrowseCards(cards: CardMeta[]): Promise<SerialisedCardFull[]> {
  return Promise.all(cards.map(serialiseBrowseCard));
}
