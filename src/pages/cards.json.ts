import { buildCardPool, toSharedAsset } from '../lib/card-pool';

/**
 * /cards.json — the site's card pool, shipped once per visitor instead of once
 * per island (docs/plans/shared-card-pool.md, map #136).
 *
 * A hand-rolled static endpoint for the same reason `/rss.xml` and
 * `/sitemap.xml` are: the payload needs `getAllCards()`, which only runs inside
 * the build. A generated `*.ts` module in the `lenses.generated.ts` style is
 * ruled out — `browse-card.ts` calls `getImage()` per card, so thumbnail URLs
 * come out of Astro's image pipeline DURING the build and no standalone
 * `scripts/*.mjs` generator can produce them (#135).
 *
 * THE FILENAME IS FIXED AND UNHASHED, and that is a ruling, not a default
 * (#138). Judged on failure mode: a fixed name degrades to a visitor holding a
 * payload slightly newer than their cached HTML, which cannot produce a broken
 * page (the active card is SSR'd, the listings re-render from the pool
 * regardless). A hashed name degrades to NO POOL AT ALL — a cached document
 * naming a deleted hash 404s, and on pdyxs.wtf that 404 comes back
 * `max-age=14400`, so a miss is negatively cached for hours. Astro strips the
 * `.ts` and the route path IS the output filename (`getOutFile`, a switch in
 * `astro/dist/core/build/common.js` with no hook before `fs.writeFile`), so
 * this file's name is the whole of the contract. The recorded upgrade path, if
 * one is ever wanted, is `/cards.json?v=<hash>` — fixed path, hashed query.
 *
 * The body is `toSharedAsset(buildCardPool())` and nothing else: exactly the
 * five keys that are byte-identical on every route. `lens`, `config`,
 * `activeUid` and `initialWidth` fail that test — they are per-location
 * identity — and stay props (#139).
 *
 * Minified: this is a fetched asset, never read by a human, and it is served
 * gzipped. Pretty-printing would add ~30% to the raw bytes to no end.
 */
export async function GET() {
  const asset = toSharedAsset(await buildCardPool());

  return new Response(JSON.stringify(asset), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
