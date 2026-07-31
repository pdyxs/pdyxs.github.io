import type { APIContext } from 'astro';
import { getAllCards } from '../lib/cards';
import { buildSitemapEntries, renderSitemap } from '../lib/sitemap';
import { SITE_URL } from '../lib/seo';
import { LENS_REGISTRY, isLensVisible } from '../lib/lens-registry';

/**
 * /sitemap.xml — thin applier over buildSitemapEntries (src/lib/sitemap.ts).
 *
 * The entry list is decided by the SAME `visibility.listed` predicate
 * buildFeedItems uses, not by @astrojs/sitemap's page enumeration: an
 * `unlisted` card has a real (reachable) URL and would be enumerated, but must
 * never be advertised. Keeping both discovery surfaces on one predicate is
 * asserted in src/lib/sitemap.test.ts.
 */
export async function GET(context: APIContext) {
  const cards = await getAllCards();

  // Static browsing surfaces: the front page plus every lens that has a
  // static path in this build (devOnly lenses 404 in production, so they're
  // filtered by the same isLensVisible predicate lens/[name].astro uses).
  const staticPaths = [
    '/',
    ...LENS_REGISTRY.filter(l => isLensVisible(l, import.meta.env.DEV)).map(l => `/lens/${l.id}`),
  ];

  const xml = renderSitemap(
    buildSitemapEntries(cards, staticPaths),
    context.site?.href ?? SITE_URL
  );

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
