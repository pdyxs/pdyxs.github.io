# Cache identity: how a hashed data asset gets its name to the client on GitHub Pages

Research for [issue #137](https://github.com/pdyxs/pdyxs.github.io/issues/137), part of map
[#136](https://github.com/pdyxs/pdyxs.github.io/issues/136). **Research only — no decision is
proposed here.** The grilling ticket ([#138](https://github.com/pdyxs/pdyxs.github.io/issues/138))
picks between the axes at the end.

Everything below is either (a) a documented promise with a citation, (b) a fact read out of the
installed Astro source in `node_modules/`, or (c) **observed behaviour** — measured on this
machine or against the live host — which is labelled as such every time. Where I searched and
found no primary source, that is stated rather than papered over.

**Versions this was done against** (`package.json`, `node_modules`): Astro **6.1.4**,
Vite **7.3.2**, Rollup **4.60.1**, Node floor 22.18. Astro's published docs at `docs.astro.build`
now serve v7; v6 docs are at `v6.docs.astro.build`.

---

## TL;DR

1. **A static endpoint's output filename is its route path. Full stop.** This is not a default that
   can be configured — it is a `switch` in Astro's build (`getOutFile`, quoted below) with no hook
   between it and disk. There is no first-party "emit a hashed file from a route" API.
2. **The ordering wall is the real constraint.** In Astro 6 the client bundle is built *before*
   pages are generated, and the payload does not exist until pages are generated (it needs
   `getImage()`). So no client-side module — no `define`, no `injectScript`, no
   `import.meta.ROLLUP_FILE_URL_*`, no `?url` import — can carry a hash of content that does not
   yet exist. **The pointer must ride in HTML**, which is the one artefact produced in the same
   phase as the payload.
3. **A hash CAN be got into the filename**, and I proved it in this repo: a *dynamic* endpoint
   route `[hash].json.ts` whose `getStaticPaths()` computes the hash. But the hash must be
   **derived independently** by every page that names it, not observed from the endpoint — there
   is no channel from one route's output back to another's.
4. **On GitHub Pages, hashing buys no header.** GH Pages sends `cache-control: max-age=600` for
   *everything*, filename irrelevant, and offers no way to configure it. What a hashed name buys
   is **correctness** (no stale-payload window) and a cache entry that survives a deploy — not
   `immutable`, not a longer TTL.
5. **This site is behind Cloudflare, and that is a live fact the decision should know about.**
   Custom cache headers are unreachable on GH Pages but *are* reachable at the Cloudflare edge.
   Measured: a CSS file on `pdyxs.wtf` is served with `max-age=14400` and `cf-cache-status: HIT`,
   while the identical class of file on GitHub's own Pages origin says `max-age=600`.
6. **A stale hashed name 404s, and the 404 is itself cached.** Observed: GitHub Pages' 404 is
   `text/html`, and on `pdyxs.wtf` it came back with `cache-control: max-age=14400`. `fetch()`
   *resolves* on a 404 (it does not reject), so a fallback is implementable, but the stale window
   is bounded by the HTML `max-age=600` — against a repo that deploys several times a day.

---

## 1. What Astro gives us

### 1.1 A static endpoint emits an unhashed file named after its route — from the source

`src/pages/rss.xml.js` and `src/pages/sitemap.xml.ts` in this repo emit exactly `dist/rss.xml`
and `dist/sitemap.xml` (verified in `dist/` after `npx astro build`). That is not a coincidence of
naming; it is the rule. From the installed Astro,
`node_modules/astro/dist/core/build/common.js`:

```js
function getOutFile(buildFormat, outFolder, pathname, routeData) {
  const routeType = routeData.type;
  switch (routeType) {
    case "endpoint":
      return new URL(npath.basename(pathname), outFolder);
    ...
```

and `getOutFolder`:

```js
    case "endpoint":
      return new URL("." + appendForwardSlash(npath.dirname(pathname)), outRoot);
```

**The endpoint's output path is the route pathname, verbatim.** There is no hash, no
`assetFileNames` template, and no integration hook between this call and
`fs.writeFile(result.outFile, result.body)` in `core/build/generate.js`. Astro's endpoint docs
describe the same thing in prose — a static endpoint "generate[s] a file at build time" at the
route's path:

> "The `.js` or `.ts` extension will be removed during the build process, so the name of the file
> should include the extension of the data you want to create. For example,
> `src/pages/data.json.ts` will build a `/data.json` endpoint."
> — [Astro, Endpoints](https://docs.astro.build/en/guides/endpoints/) (identical wording at
> [v6.docs.astro.build](https://v6.docs.astro.build/en/guides/endpoints/))

No hashing mechanism is mentioned anywhere on that page.

So: **confirmed, `src/pages/cards.json.ts` cannot emit a hashed filename.** Nothing about this is
a default that can be flipped.

### 1.2 The ordering wall (this is the load-bearing fact)

Astro 6 builds via Vite 7's Environment API. From
`node_modules/astro/dist/core/build/static-build.js`, page generation is registered as a
`buildApp` hook with `order: "post"` — i.e. it runs **after every environment (client and server)
has been bundled**:

```js
  plugins.push({
    name: "astro:build-generate",
    enforce: "post",
    buildApp: {
      order: "post",
      async handler() {
        ...
        if (settings.buildOutput === "static") {
          settings.timer.start("Static generate");
          await ssrMoveAssets(opts, internals, prerenderOutputDir);
          await generatePages(opts, internals, prerenderOutputDir);
```

`generatePages` is where routes actually execute — where `getAllCards()` runs, where
`getImage()` resolves thumbnails, and where an endpoint's `GET` returns its body. Meanwhile
`astro:build:setup` (the only hook that sees the Vite config per environment, with
`target: 'client' | 'server'`) fires during config, and `astro:build:generated` /
`astro:build:done` fire after everything, when the client JS is already written to disk and
hashed. Hook signatures verified in
`node_modules/astro/dist/types/public/integrations.d.ts`
(`astro:build:setup` → `{ vite, pages, target, updateConfig, logger }`;
`astro:build:generated` → `{ dir, logger, routeToHeaders }`;
`astro:build:done` → `{ pages, dir, assets, logger }`).

**Consequence:** every mechanism that bakes a constant into *client JavaScript* is ruled out by
ordering, not by API surface:

| mechanism | why it cannot carry the hash |
|---|---|
| `vite.define` / `import.meta.env.*` set from `astro:config:setup` | runs before the build; payload doesn't exist |
| `injectScript('before-hydration' \| 'page', content)` | content is a string fixed at config time, then bundled by Vite — same wall |
| Vite/Rollup [`this.emitFile({type:'asset'})`](https://rollupjs.org/plugin-development/#this-emitfile) + `import.meta.ROLLUP_FILE_URL_<id>` | the mechanism is real and documented — the hash comes from [`output.assetFileNames`](https://rollupjs.org/configuration-options/#output-assetfilenames), "a hash based on the content of the asset" — but a Rollup plugin can only emit what it can produce *during bundling*, and `getImage()` is not callable there (it is an `astro:assets` virtual module in the Astro module graph; Astro 6 additionally made `getImage()` throw if called client-side, per the [v6 upgrade guide](https://docs.astro.build/en/guides/upgrade-to/v6/)). Settled in [#135](https://github.com/pdyxs/pdyxs.github.io/issues/135) and unchanged. |
| [`?url` import](https://docs.astro.build/en/guides/imports/) of a file in `src/` | requires the file to already exist on disk at bundle time — same problem, plus it would need a `scripts/*.mjs` generator, which #137 rules out |
| `injectRoute` | injects a route, which is generated in the same late phase as any other route — no gain over a file-based route |

**A note on where this fact comes from.** Astro's integration reference documents *what* each hook
receives, and describes `astro:build:setup` as the "final chance to modify" the Vite config before
bundling — but it does **not** state when content-collection resolution or page generation completes
relative to it
([Integrations reference](https://docs.astro.build/en/reference/integrations-reference/)). No
primary doc says "you can safely resolve full collection data inside `astro:build:setup`", and none
says you cannot. The docs are silent; the **installed source is not**, and the `buildApp` /
`order: "post"` registration quoted above is unambiguous. Treat the ordering as read off Astro
6.1.4's implementation rather than as a promise Astro has made about future versions.

The only artefacts produced in the *same* phase as the payload are the **generated HTML pages**.
That is why the pointer has to live in HTML, and it is a structural conclusion, not a preference.

**What `?url` *does* do, for the record**, because this repo already relies on it: Astro's Vite
config sets `assetFileNames: \`${settings.config.build.assets}/[name].[hash][extname]\``
(`static-build.js`), so a `?url` import of an arbitrary file in `src/` is copied to `_astro/`
with a content hash. This repo does it for videos (`src/lib/images.ts`, `{ query: '?url' }`), and
the output is visible in `dist/_astro/trailer.ZR3TLPzQ.mp4`. Vite's inlining threshold
([`build.assetsInlineLimit`](https://vite.dev/config/build-options.html#build-assetsinlinelimit),
default 4096 bytes — "assets that are smaller than this threshold will be inlined as base64 URLs")
is far below 223 KB and so is irrelevant here; Astro's own imports guide describes the same
outcome, "a URL reference to the final built asset (e.g. `/_astro/my-video.C7vXpQtF.mp4`)"
([Astro, Imports](https://docs.astro.build/en/guides/imports/);
[Vite, Static Asset Handling](https://vite.dev/guide/assets.html)).
The mechanism is sound; it is the *source* of the bytes that is unavailable.

### 1.3 There is no first-party asset-emission API for a route

I looked for a route-level equivalent of `this.emitFile` in the Astro 6 integration surface. The
hook list in `integrations.d.ts` is: `astro:config:setup`, `astro:config:done`,
`astro:server:setup`, `astro:server:start`, `astro:server:done`, `astro:build:ssr`,
`astro:build:start`, `astro:build:setup`, `astro:build:generated`, `astro:build:done`,
`astro:route:setup`, `astro:routes:resolved`. The emission-adjacent affordances there are
`injectTypes` (writes `.d.ts` into `.astro/`), `createCodegenDir()` (a directory for generated
source, consumed by the *next* build's module graph, not this one) and `addWatchFile`. **None
emits a hashed static asset whose URL a module can import.** No primary source found describing
one.

### 1.4 What DOES work — measured, not promised

A **dynamic endpoint route** can put a build-computed value in its filename, because
`getStaticPaths()` runs inside `generatePages` (the late phase) and its params become the route
pathname, which `getOutFile` then uses verbatim.

I built this in the repo on a throwaway route (`src/pages/experiments/probe/`, since deleted) and
ran `npx astro build`:

```ts
// [hash].json.ts
export async function getStaticPaths() {
  const cards = await getAllCards();
  const body = JSON.stringify({ n: cards.length, ids: cards.map(c => c.uid).sort() });
  const hash = createHash('sha256').update(body).digest('base64url').slice(0, 8);
  return [{ params: { hash }, props: { body } }];
}
export function GET(context) { return new Response(context.props.body, { ... }); }
```

plus a sibling `.astro` page that derived the hash *independently* through a memoising helper and
wrote it into a `<meta>`.

**Observed output** (`dist/experiments/probe/`):

```
3KaDHawt.json                                  # 14,572 bytes
index.html   <meta name="probe-asset" content="/experiments/probe/3KaDHawt.json">
```

Both agreed. Four things this establishes:

- **A content-hashed static asset from a route is achievable today, with no integration and no
  standalone generator.** It is a dynamic route with one static path.
- **The name is *derived*, never *observed*.** There is no channel from the endpoint's output back
  to a page. Every page that names the asset must recompute the same hash from the same inputs.
  Correctness rests on the derivation being a pure function of build-time data, and on both call
  sites using the *same* function — a single-source-of-truth rule of exactly the kind CLAUDE.md
  already states for `resolveCard`, `placeholderTitle` and `resolveDescription`.
- **Cost is bounded by memoisation, and memoisation is safe here.** The whole static build is one
  process (the same fact CLAUDE.md's `CardStack.ssr-isolation.test.ts` invariant exists because
  of), so a module-level cache means the hash is computed once for all 612 pages. Worth noting
  `getAllCards()` currently has **no** memoisation (`src/lib/cards.ts`), so it is re-run per route
  today; anything hashing its output should not add a second full traversal per page.
- **Gotcha found the hard way:** a helper `.ts` module placed under `src/pages/` becomes a route.
  My `name.ts` helper emitted a stray `dist/experiments/probe/name` file containing Astro's 404
  page. Helper modules must live in `src/lib/`.

### 1.5 The pointer's host in this repo

`src/layouts/Base.astro` already has the exact precedent: an `is:inline` script with
`define:vars={{ stackReservation, stackSkeleton, ENTRY_SEP }}` baking build-time tables into every
page (line ~241). CLAUDE.md also already records the cost model for that channel — *"`is:inline`
script bodies are emitted verbatim, comments and all, on every one of ~590 pages"*, where a
comment cost 910 vs 339 bytes gzipped per page. A hashed URL is one short string; at 612 pages
built the total is negligible, but the channel's rules are already understood, which is worth more
than the bytes.

---

## 2. What GitHub Pages actually sends — measured

**The docs are silent, and this was checked rather than assumed.**
[About GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages)
contains no mention of Cache-Control, ETag, max-age, cache duration, CDN behaviour or response
headers at all, and no other `docs.github.com` page was found that states them. Nor is there any
documented way to configure them: GitHub Pages has no `_headers` file (unlike Netlify or
Cloudflare Pages) and no `.htaccess` equivalent — an absence corroborated by a long-running,
heavily-upvoted request thread at
[community/discussions#11884](https://github.com/orgs/community/discussions/11884), which is also
the usual source of the widely-repeated "max-age=600" figure. Pages is served through Fastly
([Fastly customer case study](https://www.fastly.com/customers/github)), consistent with the
`via: 1.1 varnish` / `x-served-by` headers below. Everything in this section is therefore **observed**, measured first-hand on 2026-09-05, and is a
description of current behaviour rather than a promise GitHub has made. It is worth stressing that
the numbers below are *not* the second-hand community figure — they are direct `curl` responses,
which is what lets them be broken down by content-type and by proxy layer in a way the community
reports do not.

Measured against **`pages.github.com`** (GitHub's own Pages site — `server: GitHub.com`, no proxy
in front):

| path | content-type | cache-control | etag |
|---|---|---|---|
| `/versions.json` | `application/json; charset=utf-8` | `max-age=600` | `"689c7eee-507"` |
| `/css/pages.css` | `text/css; charset=utf-8` | `max-age=600` | `"689c7eee-2fc2"` |

Measured against **`pdyxs.wtf`** (this site — note `server: cloudflare`):

| path | cache-control | etag | cf-cache-status |
|---|---|---|---|
| `/` (HTML) | `max-age=600` | *(none — only `last-modified`)* | `DYNAMIC` |
| `/sitemap.xml` | `max-age=600` | `W/"6846b3be-3648"` | — |
| `/CNAME` | `max-age=600` | `"6846b3be-9"` | — |
| `/assets/css/style.css` | **`max-age=14400`** | `W/"6846b3be-12b0f"` | **`HIT`** |
| `/favicon.ico` (404) | `max-age=14400` | — | `EXPIRED` |

Findings:

- **GitHub Pages' origin value is `max-age=600`, uniformly, regardless of extension or
  content-type.** The CSS at `pages.github.com` says 600 just like the JSON does. There is no
  filename-based tiering to exploit.
- **The `max-age=14400` seen on `pdyxs.wtf` is Cloudflare, not GitHub.** 14400s = 4h is
  Cloudflare's default Browser Cache TTL, and the response carries `cf-cache-status: HIT`. The
  same class of file straight from GitHub says 600. **This site has a configurable cache layer
  that GitHub Pages alone does not offer** — that is a fact #138 should have in front of it.
- **ETags are present and conditional requests work.** `If-None-Match` against
  `pages.github.com/versions.json` returned **304**; the same against the `pdyxs.wtf` CSS returned
  **304**. The tag looks like `"<mtime-hex>-<size-hex>"` (nginx-style), and becomes weak (`W/`)
  when the response is compressed.
- **JSON is compressed.** `Accept-Encoding: gzip` on `/versions.json` returned
  `content-encoding: gzip`, `vary: Accept-Encoding`, `content-length: 517`.
- Responses go through Fastly (`via: 1.1 varnish`, `x-served-by`, `x-cache`) — consistent with
  GitHub's published move of Pages onto Fastly — with Cloudflare in front on this domain.

### 2.1 So what does a hashed name buy, in RFC terms?

Framed against [RFC 9111](https://www.rfc-editor.org/rfc/rfc9111.html) (HTTP Caching):

- **Freshness lifetime is 600s either way** ([RFC 9111 §4.2](https://www.rfc-editor.org/rfc/rfc9111.html#section-4.2)). `max-age=600` is set by the origin on filename-blind
  grounds, so a hashed asset and `/cards.json` get the *same* freshness. There is no heuristic
  freshness in play (§4.2.2) because an explicit `max-age` is present.
- **`immutable` ([RFC 8246](https://www.rfc-editor.org/rfc/rfc8246.html)) is not obtainable**
  from GitHub Pages. The whole "hashed name → `Cache-Control: max-age=31536000, immutable`"
  playbook depends on a header the host will not send. *(It is obtainable at the Cloudflare edge —
  see above — but that is an infrastructure decision, not an Astro one.)*
- **What hashing still buys, on these headers:**
  1. **Correctness inside the freshness window.** With a fixed `/cards.json`, a visitor can hold a
     10-minute-stale payload with *zero* network requests and no way for the site to know. With a
     hashed name, the HTML names the payload, so a fresh HTML implies a fresh payload; the two can
     never disagree.
  2. **Cross-deploy cache survival.** An unchanged hashed asset keeps its name across deploys, so
     its cache entry stays valid. A fixed `/cards.json` changes its ETag every time the file is
     rewritten — and `npm run build` output is only byte-stable if the payload is; with 231
     commits in the last 30 days, several a day, revalidation will frequently be a full re-download
     rather than a 304.
  3. **Avoiding the revalidation round trip entirely** *only if* an `immutable`/long `max-age`
     header can be arranged — i.e. only via Cloudflare here.
- **What hashing does NOT buy on GitHub Pages:** a longer TTL, `immutable`, or fewer requests. A
  304 on `/cards.json` already costs one small round trip after 10 minutes; a hashed asset that
  the browser must still revalidate after 10 minutes costs the same round trip. The difference is
  what happens *before* those 10 minutes are up.

---

## 3. The stale-name failure mode

Scenario: a visitor holds cached HTML naming `/cards.ABC123.json`; a deploy has replaced it with
`/cards.DEF456.json`.

**Observed — and the docs are silent here too.** GitHub's
[custom 404 page](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-custom-404-page-for-your-github-pages-site)
doc explains how to *author* a `404.html`, but states nothing about what is served in its absence:
no status-code or content contract is documented. Measured, GitHub Pages returns **404** with
`content-type: text/html; charset=utf-8` and a generic GitHub 404 body. This repo has no `src/pages/404.astro`, so there is no custom 404 either;
GitHub's own is what is served. On `pdyxs.wtf` the 404 for `/favicon.ico` carried
`cache-control: max-age=14400` (again Cloudflare's doing), meaning **a missed hashed name can be
negatively cached for hours**, which matters for any retry strategy.

**How long the stale window lasts:** it is bounded by the HTML's own freshness, `max-age=600`
(observed, `cf-cache-status: DYNAMIC` — Cloudflare is not extending HTML). So a visitor's worst
case is roughly ten minutes of holding a name that no longer exists, *per deploy*. Given the deploy
cadence in this repo (231 commits / 30 days, `content: auto-sync` several times a day), this is a
routine occurrence, not a corner case.

**Recovery patterns, and which are available here:**

| pattern | available on GH Pages? | cost |
|---|---|---|
| `fetch` the hashed name, on `!res.ok` fall back to a second, **unhashed** copy at a fixed path | **Yes** — needs no server. per [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch) the promise "does not reject if the server responds with HTTP status codes that indicate errors (`404`…). Instead, a `then()` handler must check `Response.ok`" — so `res.ok === false` is the branch, and client-only recovery is tractable. | the payload ships twice in `dist` (~223 KB duplicated on disk, never both downloaded); a stale visitor pays two RTTs |
| Service worker that rewrites/retries | Possible in principle | **This repo has no service worker**, and adding one is a large new surface (registration lifecycle, update semantics, its own staleness class) |
| Version query string on a fixed name (`/cards.json?v=<hash>`) | Yes | the name never 404s, so no stale-name failure at all. RFC 9111's cache key is the whole request target including the query, so a spec-compliant cache treats it as a distinct resource — but real CDNs vary in whether they strip query strings from the cache key, and no primary source was found stating Fastly-behind-Pages' behaviour. Treat it as a cache-buster of uncertain reach, not a cache identity. |
| Reload the page on failure | Yes | ugly, and the HTML is what is stale — a reload inside the 600s window may serve the same stale HTML from the browser cache unless forced |
| Server-side redirect / rewrite from old hash to current | **No** — GitHub Pages has no server-side logic (which is why `astro.config.mjs` already emits meta-refresh HTML pages for the Jekyll redirects) | — |

A `<link rel="preload" as="fetch">` for the hashed asset is worth noting as an *optimisation*, not
a recovery: it "let[s] you declare fetch requests in the HTML's `<head>`… before browsers' main rendering
machinery kicks in"
([MDN, `rel=preload`](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/rel/preload)),
i.e. during HTML parse rather than after island hydration. It carries the same stale-name risk and
cannot recover from it — a 404'd preload is a wasted request and a console warning, and does not
block or fail the real fetch that follows.

---

## 4. Prior art: telling a client a hashed asset's name with no server

Four patterns, and how each lands on a host with no server-side logic:

**(a) An unhashed manifest fetched first.** The Vite pattern: `build.manifest` emits
`.vite/manifest.json` mapping source names to hashed outputs
([Vite, `build.manifest`](https://vite.dev/config/build-options.html#build-manifest) — "a mapping
of non-hashed asset filenames to their hashed versions… used by a server framework to render the
correct asset links"). Note Vite frames it as being read by a *server* framework at request time. Used client-side it costs a **second round trip in
series** — manifest, then payload — and the manifest itself is unhashed, so it inherits exactly
the 600s staleness the hashing was meant to remove. **Trades the stale-name problem for a
waterfall plus a stale-manifest problem.**

**(b) The name baked into the JS bundle.** The cleanest pattern in general: the constant rides in
a chunk that is itself content-hashed, so a new payload implies a new chunk implies a new HTML
reference. The closest documented analogues are the frameworks' *version* constants rather than
per-asset names — SvelteKit's [`config.kit.version`](https://svelte.dev/docs/kit/configuration)
("Client-side navigation can be buggy if you deploy a new version of your app while people are
using it"; the name "must be deterministic (like a commit hash)"), and Next's
[`generateBuildId`](https://nextjs.org/docs/pages/api-reference/pages/next-config-js/generateBuildId)
("Next.js generates an ID during `next build` to identify which version of your application is
being served"). Same shape: a build-time constant compiled into a hashed bundle. **Ruled out here
by §1.2's ordering wall** — the client bundle is sealed before the payload exists.

**(c) The name in the HTML head** — a `<meta>`, a `<script type="application/json">`, a
`define:vars` inline script, or a `<link rel="preload">`. HTML is the layer that *must* be
revalidated anyway (it is the entry point, and it is where every hashed reference on every site
ultimately bottoms out), so putting the pointer there adds no cacheability cost that was not
already being paid. **No extra round trip**, and with `preload` the fetch can start before
hydration. The cost is that the pointer is duplicated into every page (612 here, ~60 bytes each)
and that the HTML's own `max-age=600` sets the stale-name window (§3).

**(d) `import.meta.url` / `import.meta.ROLLUP_FILE_URL_<id>`.** Rollup's supported way for a
plugin to reference a file it emitted
([Rollup plugin development: file URLs](https://rollupjs.org/plugin-development/#file-urls)).
Correct mechanism, wrong phase — same wall as (b).

On a no-server host the axis is really: **who pays the round trip, and who owns the staleness.**
(a) pays an extra serial RTT and keeps the staleness. (c) pays nothing extra and moves the
staleness onto HTML, which is already revalidated. (b) and (d) are unavailable.

---

## 5. What the decision in #138 actually has to trade off

Nothing below is a recommendation; these are the axes the facts leave open.

1. **Fixed name vs derived hash.** `/cards.json` is one line and no new concept, and costs a
   ≤10-minute window in which a visitor's payload may silently disagree with their HTML. A derived
   hash closes that window and survives deploys in cache, and costs a derivation that two call
   sites must agree on forever — a new single-source-of-truth rule, on a codebase that already
   carries several and documents why each exists.
2. **Whether `immutable` is worth reaching for at all.** GitHub Pages will not send it. Cloudflare
   (already in front of this domain) will. Is a cache rule at the edge in scope for a map about
   island payloads, or does that make the site's correctness depend on infrastructure that is not
   in the repo?
3. **How much a stale name is allowed to cost.** Ship a second unhashed copy as a fallback
   (~223 KB of duplicated `dist`, two RTTs for an unlucky visitor, but never a broken page), or
   accept that a stale visitor's islands see a failed fetch and must render their loading/empty
   state until the HTML revalidates. That is a question about what each island does while it waits
   — which is the neighbouring ticket, and the two answers constrain each other.
4. **Where the pointer lives.** `define:vars` inline script (the existing house pattern, verbatim
   on every page), a `<meta>`, or a `<link rel="preload" as="fetch">` that also starts the fetch
   early. These differ in bytes-per-page and in whether the fetch can begin before hydration.
5. **Whether the hash is over the payload or over something cheaper.** A hash of the serialised
   223 KB payload is exact but must be computed (once, memoised) during the build; a hash over a
   cheaper proxy (card count + content hashes, already resolved per card) is faster but only as
   correct as the proxy. Given `getAllCards()` is currently un-memoised and re-run per route, the
   cost model here is worth a moment.

---

## Appendix: reproduction

- Versions: `node -p "require('./node_modules/astro/package.json').version"` → `6.1.4`;
  vite `7.3.2`; rollup `4.60.1`.
- Source quotes: `node_modules/astro/dist/core/build/common.js` (`getOutFile`/`getOutFolder`),
  `node_modules/astro/dist/core/build/static-build.js` (`buildApp` post handler, `assetFileNames`),
  `node_modules/astro/dist/core/build/generate.js` (`writeFile`),
  `node_modules/astro/dist/types/public/integrations.d.ts` (hook signatures).
- Build probe: throwaway route under `src/pages/experiments/probe/`, `npx astro build`
  (612 pages, 15.8s with a warm image cache), inspect `dist/experiments/probe/`. Deleted after.
- Header probes: `curl -sSI` against `https://pages.github.com/...` and `https://pdyxs.wtf/...`,
  2026-09-05. Conditional GETs with `-H "If-None-Match: <etag>"`.
