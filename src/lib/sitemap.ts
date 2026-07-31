// Pure decision core for /sitemap.xml (src/pages/sitemap.xml.ts).
//
// Deliberately NOT @astrojs/sitemap: that integration enumerates emitted pages,
// which would include every `unlisted` card (they're reachable, so they have a
// static path) and would put a second, divergent copy of the publish-lifecycle
// rules in the build. Instead the sitemap reads the SAME `visibility.listed`
// predicate buildFeedItems uses (see computeStatusVisibility), so
// draft/unlisted/archived/future-scheduled cards can never appear on one
// discovery surface but not the other. src/lib/sitemap.test.ts asserts that
// agreement against the shared fixtures in src/test/card-fixtures.ts.

import type { CardMeta } from './cards';
import { resolveCanonical } from './seo';

export type SitemapEntry = {
  /** Site-root-relative path, e.g. "/card/what/posts/about-me". */
  path: string;
  /** W3C-datetime lastmod (YYYY-MM-DD), omitted for undated locations. */
  lastmod?: string;
};

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Builds the sitemap entry list: every `visibility.listed` card, plus the
 * caller-supplied static paths (the front page and each visible lens), which
 * are emitted first and carry no lastmod. Card entries are sorted by path so
 * the emitted XML is stable across builds.
 */
export function buildSitemapEntries(
  cards: CardMeta[],
  staticPaths: readonly string[] = []
): SitemapEntry[] {
  const cardEntries = cards
    .filter(c => c.visibility.listed)
    .map((c): SitemapEntry => ({
      path: `/card/${c.uid}`,
      ...(c.date ? { lastmod: isoDate(c.date) } : {}),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  return [...staticPaths.map(path => ({ path })), ...cardEntries];
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Renders entries as a sitemap.org 0.9 urlset document. */
export function renderSitemap(entries: SitemapEntry[], site: string): string {
  const urls = entries
    .map(e => {
      const lastmod = e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : '';
      // resolveCanonical, not a bare join: every loc must be byte-identical to
      // the <link rel="canonical"> the page itself emits (trailing slash and
      // all), or the sitemap advertises a URL that points somewhere else.
      return `  <url>\n    <loc>${escapeXml(resolveCanonical(e.path, site))}</loc>${lastmod}\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
