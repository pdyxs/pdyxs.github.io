import { describe, it, expect } from 'vitest';
import { buildSitemapEntries, renderSitemap } from './sitemap';
import { buildFeedItems } from './rss';
import { card, VISIBILITY_FIXTURES, LISTED_UIDS } from '../test/card-fixtures';

describe('buildSitemapEntries', () => {
  it('includes exactly the visibility.listed cards', () => {
    const entries = buildSitemapEntries(VISIBILITY_FIXTURES);
    expect(entries.map(e => e.path)).toEqual(
      [...LISTED_UIDS].map(uid => `/card/${uid}`).sort((a, b) => a.localeCompare(b))
    );
  });

  it('excludes draft, unlisted, archived and future-scheduled cards', () => {
    const hidden = VISIBILITY_FIXTURES.filter(c => !c.visibility.listed);
    const paths = new Set(buildSitemapEntries(VISIBILITY_FIXTURES).map(e => e.path));
    // `unlisted` is reachable — it has a real URL — but must never be advertised.
    expect(hidden.length).toBeGreaterThan(0);
    for (const c of hidden) expect(paths.has(`/card/${c.uid}`)).toBe(false);
  });

  it('emits lastmod for dated cards and omits it for undated ones', () => {
    const entries = buildSitemapEntries([
      card({ uid: 'posts/dated', date: new Date('2026-01-02T10:00:00Z') }),
      card({ uid: 'posts/undated', date: undefined }),
    ]);
    expect(entries).toEqual([
      { path: '/card/posts/dated', lastmod: '2026-01-02' },
      { path: '/card/posts/undated' },
    ]);
  });

  it('puts the supplied static paths first and leaves them undated', () => {
    const entries = buildSitemapEntries([card({ uid: 'posts/a' })], ['/', '/lens/newest']);
    expect(entries.slice(0, 2)).toEqual([{ path: '/' }, { path: '/lens/newest' }]);
  });

  it('sorts card entries by path for a stable build output', () => {
    const entries = buildSitemapEntries([card({ uid: 'posts/z' }), card({ uid: 'posts/a' })]);
    expect(entries.map(e => e.path)).toEqual(['/card/posts/a', '/card/posts/z']);
  });
});

// The bug this guards: the sitemap and the feed growing separate copies of the
// publish-lifecycle rules, so a draft (or a future-scheduled post) leaks into
// one surface after the other is fixed.
describe('sitemap and RSS agree card-for-card', () => {
  it('never advertises a card in the feed that the sitemap omits', () => {
    const feedPaths = new Set(buildFeedItems(VISIBILITY_FIXTURES).map(i => i.link));
    const sitemapPaths = new Set(buildSitemapEntries(VISIBILITY_FIXTURES).map(e => e.path));
    for (const path of feedPaths) expect(sitemapPaths.has(path)).toBe(true);
  });

  it('agrees exactly on dated cards (the feed only differs by dropping undated ones)', () => {
    const feedPaths = new Set(buildFeedItems(VISIBILITY_FIXTURES).map(i => i.link));
    const sitemapPaths = new Set(buildSitemapEntries(VISIBILITY_FIXTURES).map(e => e.path));
    for (const c of VISIBILITY_FIXTURES) {
      const path = `/card/${c.uid}`;
      if (c.date) {
        expect([c.uid, sitemapPaths.has(path)]).toEqual([c.uid, feedPaths.has(path)]);
      } else {
        expect(feedPaths.has(path)).toBe(false);
        expect(sitemapPaths.has(path)).toBe(c.visibility.listed);
      }
    }
  });
});

describe('renderSitemap', () => {
  it('renders absolute locs under a urlset', () => {
    const xml = renderSitemap([{ path: '/card/posts/a', lastmod: '2026-01-02' }], 'https://pdyxs.wtf');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    // Identical to the page's own <link rel="canonical"> — trailing slash included.
    expect(xml).toContain('<loc>https://pdyxs.wtf/card/posts/a/</loc>');
    expect(xml).toContain('<lastmod>2026-01-02</lastmod>');
  });

  it('omits the lastmod element entirely when there is no date', () => {
    expect(renderSitemap([{ path: '/' }], 'https://pdyxs.wtf')).not.toContain('lastmod');
  });

  it('escapes XML-significant characters in paths', () => {
    expect(renderSitemap([{ path: '/card/a&b' }], 'https://pdyxs.wtf')).toContain('/card/a&amp;b/');
  });
});
