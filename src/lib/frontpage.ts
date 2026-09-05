import type { CardMeta } from './cards';
import type { SerialisedCard } from './browse-helpers';
import type { FilterState } from '../dimensions';
import { filterStateToParams } from '../dimensions';
import { selectSlotCard } from './slot-selection';
import { DEFAULT_BROWSE_LENS_ID } from './lens-registry';
import { resolveBrowseCardVariant } from './browse-card-variants';
import type { BrowseCardVariant } from './browse-card-variants';
import type { NormalisedSlot, SlotTiers } from './home-slots';

/**
 * The home lens's `config` block, as baked into lenses.generated.ts by
 * scripts/generate-lens-registry.mjs — already validated and normalised by
 * parseHomeSlots (home-slots.ts), so nothing here defaults anything.
 */
export type FrontPageConfig = {
  slots: NormalisedSlot[];
};

export type SerialisedCardFull = SerialisedCard & { contentHash: string };

/**
 * One resolved slot: the grid cell's layout, its chrome, and the card that
 * landed in it.
 *
 * There is no pinned/filter union any more (#131). A slot is a cell with a
 * card in it; where the card came from is `frontpage.ts`'s business and
 * nothing downstream needs to know.
 */
export type ResolvedSlot = {
  /**
   * The card, or null when nothing resolved.
   *
   * A `uid:` naming no card renders with `card: null` — chrome and grid cell
   * intact, no card. Dropping the slot silently (which is what the old
   * PinnedSlot path did) would reflow every other slot around a typo now that
   * `span` exists. A visible hole is a signal.
   *
   * Singular, deliberately: shipping an array-of-one for a future `count:`
   * makes every call site handle a case that cannot occur. The schema doesn't
   * preclude it, and this field changes shape in one file when it lands.
   */
  card: SerialisedCardFull | null;
  variant: BrowseCardVariant;
  span: SlotTiers;
  rows: SlotTiers;
  side: 'main' | 'right';
  label?: string;
  /** Present only when the slot asked for it (`seeMore: true`). */
  seeMoreUrl?: string;
};

/**
 * Builds the URL for a given filter state. Always routes to the fallback
 * browse lens (DEFAULT_BROWSE_LENS_ID) — home can't accept filters, so a
 * filter added there falls through to the browse lens carrying the full
 * FilterState rather than landing on a `/` that would silently drop it.
 */
export function buildBrowseUrl(filter: FilterState): string {
  const params = filterStateToParams(filter);
  const query = params.toString();
  const base = `/lens/${DEFAULT_BROWSE_LENS_ID}`;
  return query ? `${base}?${query}` : base;
}

/**
 * Resolves a list of card UIDs to their CardMeta entries, preserving order.
 * UIDs that don't match any card are silently dropped.
 */
export function resolvePinnedCards(uids: string[], allCards: CardMeta[]): CardMeta[] {
  const byUid = new Map(allCards.map(c => [c.uid, c]));
  return uids.flatMap(uid => {
    const card = byUid.get(uid);
    return card ? [card] : [];
  });
}

export type ResolvedFrontPageSlots = {
  slots: ResolvedSlot[];
};

/**
 * Resolves a FrontPageConfig's slots against a card set: a `uid:` slot resolves
 * directly by uid; a `filter:` slot uses the day-seeded selectSlotCard() pick.
 *
 * Card selection alone — the layout half of a slot arrived normalised and is
 * copied straight through.
 *
 * Pure decision, no side effects — selectSlotCard reads view-state
 * (localStorage) as one rung of the ranking chain, but nothing here writes it.
 * Showing a card is no longer an event the site records at all (issue #83):
 * only opening one is.
 */
export function resolveFrontPageSlots(
  config: FrontPageConfig,
  cards: SerialisedCardFull[],
  now: Date,
  /** Card-backed values from the FULL card set — see applyFilters. */
  cardBackedValues?: Set<string>,
): ResolvedFrontPageSlots {
  const byUid = new Map(cards.map(c => [c.uid, c]));
  // SerialisedCard (browse-helpers.ts) doesn't carry status/visibility across
  // the server→client boundary — the pool reaching here is already the
  // listing-filtered set (LensStackCard filters getAllCards() on `.listed`
  // before serialising), so synthesising the published/visible defaults here
  // is accurate for this already-filtered pool. selectSlotCard doesn't read
  // either field.
  const cardMetas: CardMeta[] = cards.map(c => ({
    ...c,
    date: c.date ? new Date(c.date) : undefined,
    status: 'published',
    visibility: { listed: true, reachable: true },
  }));

  const slots: ResolvedSlot[] = config.slots.map(slot => {
    let card: SerialisedCardFull | null = null;
    if (slot.uid !== undefined) {
      card = byUid.get(slot.uid) ?? null;
    } else if (slot.filter !== undefined) {
      const meta = selectSlotCard(
        cardMetas,
        slot.filter,
        now,
        undefined,
        cardBackedValues,
        slot.pool,
      );
      card = meta ? byUid.get(meta.uid) ?? null : null;
    }

    return {
      card,
      variant: resolveBrowseCardVariant(slot.variant),
      span: slot.span,
      rows: slot.rows,
      side: slot.side,
      ...(slot.label !== undefined ? { label: slot.label } : {}),
      ...(slot.seeMore && slot.filter ? { seeMoreUrl: buildBrowseUrl(slot.filter) } : {}),
    };
  });

  return { slots };
}
