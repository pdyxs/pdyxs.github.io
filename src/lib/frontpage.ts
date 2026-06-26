import type { CardMeta } from './cards';
import type { SerialisedCard } from './browse-helpers';
import type { FilterState } from './filters';
import { filterStateToParams } from './filters';

export type PinnedSlotConfig = {
  type: 'pinned';
  uid: string;
};

export type FilterSlotConfig = {
  type: 'filter';
  filter: FilterState;
  label: string;
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

/** Builds the URL for a given filter state (always rooted at /). */
export function buildBrowseUrl(filter: FilterState): string {
  const params = filterStateToParams(filter);
  const query = params.toString();
  return query ? `/?${query}` : '/';
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
