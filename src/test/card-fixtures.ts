// Shared CardMeta fixtures for the discovery-surface tests.
//
// buildFeedItems (src/lib/rss.ts) and buildSitemapEntries (src/lib/sitemap.ts)
// must agree card-for-card on which cards are publicly discoverable — both
// read the SAME `visibility.listed` predicate. Keeping one fixture set here is
// what makes a drift between them a test failure rather than a silent
// production bug (a draft leaking into the sitemap, say).

import type { CardMeta } from '../lib/cards';

export function card(overrides: Partial<CardMeta> = {}): CardMeta {
  return {
    uid: 'posts/example',
    title: 'Example',
    tags: [],
    renderer: 'card',
    contentHash: 'hash',
    status: 'published',
    visibility: { listed: true, reachable: true },
    ...overrides,
  } as CardMeta;
}

/**
 * One card per publish-lifecycle outcome, with and without a date. Consumed by
 * both rss.test.ts and sitemap.test.ts.
 */
export const VISIBILITY_FIXTURES: CardMeta[] = [
  card({ uid: 'what/posts/published-dated', title: 'Published dated', date: new Date('2026-01-02') }),
  card({ uid: 'what/posts/published-undated', title: 'Published undated', date: undefined }),
  card({
    uid: 'what/posts/draft',
    title: 'Draft',
    status: 'draft',
    date: new Date('2026-01-03'),
    visibility: { listed: false, reachable: false },
  }),
  card({
    uid: 'what/posts/unlisted',
    title: 'Unlisted',
    status: 'unlisted',
    date: new Date('2026-01-04'),
    visibility: { listed: false, reachable: true },
  }),
  card({
    uid: 'what/posts/archived',
    title: 'Archived',
    status: 'archived',
    date: new Date('2020-01-01'),
    visibility: { listed: false, reachable: false },
  }),
  card({
    uid: 'what/posts/scheduled-future',
    title: 'Scheduled (future)',
    status: 'scheduled',
    date: new Date('2099-01-01'),
    visibility: { listed: false, reachable: false },
  }),
  card({
    uid: 'what/posts/scheduled-reached',
    title: 'Scheduled (reached)',
    status: 'scheduled',
    date: new Date('2025-06-01'),
    visibility: { listed: true, reachable: true },
  }),
];

/** The uids that must appear on every public discovery surface. */
export const LISTED_UIDS = [
  'what/posts/published-dated',
  'what/posts/published-undated',
  'what/posts/scheduled-reached',
];
