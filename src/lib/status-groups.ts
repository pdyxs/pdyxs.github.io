// Pure grouping decision for the dev-only editorial lens (issue #53) — turns
// the raw card pool into ordered status buckets with counts. Groups off the
// raw `status` field on CardMeta, not `.visibility`: visibility is computed
// with an isDev bypass (see status-visibility.ts) that makes every card
// "listed" on the dev/preview server regardless of its declared status, so
// `.visibility` can't distinguish lifecycle state there. `status` always can.
//
// Kept side-effect-free (no IO, no Astro, no store reads) so it's unit-tested
// independently of the lens component that renders its output.

import type { CardMeta } from './cards';
import type { StatusValue } from './status-visibility';

export interface StatusGroup {
  status: StatusValue;
  label: string;
  cards: CardMeta[];
  count: number;
}

// Fixed display order and label per non-published status. `published` is
// deliberately absent — the editorial dashboard is "what's in flight", not a
// full card index.
const GROUP_ORDER: ReadonlyArray<{ status: StatusValue; label: string }> = [
  { status: 'draft', label: 'Drafts' },
  { status: 'scheduled', label: 'Scheduled' },
  { status: 'unlisted', label: 'Unlisted' },
  { status: 'archived', label: 'Archived' },
];

/**
 * Groups cards by declared status into the fixed Drafts/Scheduled/Unlisted/
 * Archived order, skipping `published` cards entirely and omitting any group
 * with no members. Cards keep their relative order within each group.
 */
export function groupCardsByStatus(cards: readonly CardMeta[]): StatusGroup[] {
  const byStatus = new Map<StatusValue, CardMeta[]>();

  for (const card of cards) {
    if (card.status === 'published') continue;
    const bucket = byStatus.get(card.status);
    if (bucket) bucket.push(card);
    else byStatus.set(card.status, [card]);
  }

  return GROUP_ORDER
    .filter(({ status }) => byStatus.has(status))
    .map(({ status, label }) => {
      const groupCards = byStatus.get(status)!;
      return { status, label, cards: groupCards, count: groupCards.length };
    });
}
