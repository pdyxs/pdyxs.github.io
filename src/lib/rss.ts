// Pure decision core for the RSS feed (src/pages/rss.xml.js).
//
// Kept separate from the route so the filtering/ordering rule is testable
// without spinning up an Astro request — see the "Pure logic and
// testability" convention in CLAUDE.md.

import type { CardMeta } from './cards';

export type FeedItem = {
  title: string;
  description?: string;
  link: string;
  pubDate: Date;
};

/**
 * Builds RSS feed items from the full card pool. Two filters apply:
 *   - `.visibility.listed` (see computeStatusVisibility): a hidden-stage
 *     card (draft, unreached-scheduled, etc.) contributes no feed item, the
 *     same rule the tag registry and browse/lens pool already apply.
 *   - a resolvable `date`: undated cards (e.g. static pages) have nothing to
 *     order a chronological feed by, so they're excluded rather than sorted
 *     arbitrarily.
 * Sorted newest first.
 */
export function buildFeedItems(cards: CardMeta[]): FeedItem[] {
  return cards
    .filter((c): c is CardMeta & { date: Date } => c.visibility.listed && !!c.date)
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map(c => ({
      title: c.title,
      ...(c.description !== undefined ? { description: c.description } : {}),
      link: `/card/${c.uid}`,
      pubDate: c.date,
    }));
}
