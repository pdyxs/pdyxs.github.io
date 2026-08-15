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
import { resolveLocalImage, isRemoteImageUrl } from './images';
import type { CardMeta } from './cards';
import type { SerialisedCardFull } from './frontpage';

/**
 * Resolve a card's header `image` to a thumbnail.
 *
 * Local images go through astro:assets at two widths — a full-width mobile card
 * at 2x (720) down to a 3-up desktop column (360); the `sizes` attribute on
 * BrowseCard's <img> picks between them. A remote image is used as-is, but only
 * when the URL ends in a known image extension: the migrated content is full of
 * dead Jekyll-era embed and video links that would otherwise render as broken
 * images.
 */
async function resolveThumb(card: CardMeta): Promise<{ thumb?: string; thumbSrcset?: string }> {
  const localImage = resolveLocalImage(card.uid, card.image);
  if (localImage) {
    const generated = await getImage({ src: localImage, widths: [360, 720], format: 'webp' });
    return { thumb: generated.src, thumbSrcset: generated.srcSet.attribute };
  }
  if (card.image && isRemoteImageUrl(card.image)) {
    return { thumb: card.image };
  }
  return {};
}

/**
 * Serialise one card into the browse-card payload.
 *
 * The field list is an explicit pick, never a spread of the card (see CLAUDE.md).
 * A spread skips excess-property checking, so build-time-only fields
 * (`visibility`, `image`, `order`) ship to the browser despite the type not
 * declaring them — and every field later added to CardMeta joins them. What
 * crosses the wire stays a decision.
 */
export async function serialiseBrowseCard(card: CardMeta): Promise<SerialisedCardFull> {
  const { thumb, thumbSrcset } = await resolveThumb(card);
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
    // HomeLensSlots keys markDisplayed() on this hash.
    contentHash: card.contentHash,
    // The build-time rungs of the ranking chain (ranking.ts): the comparator
    // itself runs in the browser, since filter-match count and seen-ness are
    // only knowable there.
    priority: card.priority,
    sort: card.sort,
    thumb,
    thumbSrcset,
  };
}

/** Serialise a list of cards, resolving their thumbnails concurrently. */
export function serialiseBrowseCards(cards: CardMeta[]): Promise<SerialisedCardFull[]> {
  return Promise.all(cards.map(serialiseBrowseCard));
}
