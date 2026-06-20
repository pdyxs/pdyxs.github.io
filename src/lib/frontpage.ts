import type { CardMeta } from './cards';
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

/** Builds the /browse URL for a given filter state. */
export function buildBrowseUrl(filter: FilterState): string {
  const params = filterStateToParams(filter);
  const query = params.toString();
  return query ? `/browse?${query}` : '/browse';
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
