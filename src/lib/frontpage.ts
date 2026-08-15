import type { CardMeta } from './cards';
import type { SerialisedCard } from './browse-helpers';
import type { FilterState } from '../dimensions';
import { filterStateToParams } from '../dimensions';
import { selectSlotCard } from './slot-selection';
import { DEFAULT_BROWSE_LENS_ID } from './lens-registry';

export type PinnedSlotConfig = {
  type: 'pinned';
  uid: string;
};

export type FilterSlotConfig = {
  type: 'filter';
  filter: FilterState;
  label: string;
  /**
   * How many of this slot's top-ranked cards the day-seed picks between
   * (issue #83). Declared per slot in the lens YAML; DEFAULT_SLOT_POOL when
   * absent. A bigger pool trades day-to-day variety for authored control.
   */
  pool?: number;
};

export type SlotConfig = PinnedSlotConfig | FilterSlotConfig;

export type FrontPageConfig = {
  slots: SlotConfig[];
};

export type SerialisedCardFull = SerialisedCard & { contentHash: string };

export type ResolvedPinned = {
  type: 'pinned';
  uid: string;
  title: string;
  description?: string;
};

export type ResolvedFilter = {
  type: 'filter';
  label: string;
  card: SerialisedCardFull | null;
  browseUrl: string;
};

export type ResolvedSlot = ResolvedPinned | ResolvedFilter;

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
 * Resolves a FrontPageConfig's slots against a card set: pinned slots resolve
 * directly by uid; filter slots use the day-seeded selectSlotCard() pick.
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

  const slots: ResolvedSlot[] = [];

  for (const slotConfig of config.slots) {
    if (slotConfig.type === 'pinned') {
      const card = byUid.get(slotConfig.uid);
      if (card) slots.push({ type: 'pinned', uid: card.uid, title: card.title, description: card.description });
    } else {
      const meta = selectSlotCard(
        cardMetas,
        slotConfig.filter,
        now,
        undefined,
        cardBackedValues,
        slotConfig.pool,
      );
      const card = meta ? byUid.get(meta.uid) ?? null : null;
      slots.push({ type: 'filter', label: slotConfig.label, card, browseUrl: buildBrowseUrl(slotConfig.filter) });
    }
  }

  return { slots };
}
