# The shared card pool — implementation spec

The locked spec for wayfinder map
[#136, *Load the site's card data once per visitor, not once per island*](https://github.com/pdyxs/pdyxs.github.io/issues/136),
assembled by [#142](https://github.com/pdyxs/pdyxs.github.io/issues/142).

**Nothing here is decided by this document.** Every ruling below belongs to a closed
ticket and is cited. Where the map deliberately left something to the implementation,
this spec says so in those words rather than inventing an answer. Two places where the
code contradicts the map's own summary are flagged as **Correction** — both were found
while assembling this, and neither changes a decision.

The destination the map set: an implementation session can change `LensStackCard`, the
consuming islands and the fragment route without another decision needing to be made.

---

## Why

Production build, 269 cards. The `cards` array is **223 KB (~830 B/card)** and
**byte-identical on every lens route and every lens fragment**. Three duplications, and
they are independent ([#135](https://github.com/pdyxs/pdyxs.github.io/issues/135)):

1. **Within a page** — `tagDisplay` ships three times on a single lens page,
   `hierarchies` is 48 KB.
2. **Across documents** — every lens fragment re-sends the whole pool.
3. **Across navigations** — it lives in HTML, so it is structurally uncacheable.

The worst case is an ordinary stack URL: `?from=0.6` is three documents totalling
524 KB, of which 78% is **one collapsed spine** — `/fragment/lens/home` at 408 KB,
hydrating two islands carrying all 269 cards to render a 24px vertical title.

Gzip hides the bytes (57 KB for `/`). What it does not hide is the HTML-unescape plus
`JSON.parse` of a ~290 KB attribute on the main thread before hydration, and the
per-fragment multiplication. Scale is linear at ~830 B/card with no cliff: ~600 cards
≈ 500 KB raw on `/`.

---

## Implementation task breakdown

Ten slices, each a session's work, each independently buildable and reversible. The
dependency order is the numbering; where two slices are genuinely parallel it says so.

| # | slice | done when | verified by |
|---|---|---|---|
| 1 | **Extract the builder** — `buildCardPool()` + `toSharedAsset()` in `src/lib/card-pool.ts`; `LensStackCard` calls it instead of running the pipeline inline. Module-level memo. | `LensStackCard.astro`'s frontmatter contains no pipeline, and the built HTML is unchanged *in the normalised sense below*. | `npm run check`, `npm test`, and a **normalised** diff of `dist/` against a build taken before the slice. |
| 2 | **Ship the endpoint** — `src/pages/cards.json.ts`. Nothing consumes it. | `dist/cards.json` exists, parses, and holds exactly the five keys. | A test asserting `toSharedAsset(buildCardPool())` has exactly the five keys and that each is JSON-round-trippable; `ls -l dist/cards.json`. |
| 3 | **The client loader** — `src/lib/card-pool.client.ts` (`loadCardPool()`), plus the `is:inline` promise in `Base.astro`. Still nothing consumes it. | A cold load issues exactly **one** request for `/cards.json`, started before hydration. | Playwright network panel via `/verify`: one entry, initiated by the document, not by a chunk. |
| 4 | **Extract the skeleton** — the `.fp-skeleton*` markup out of `BrowseResults.svelte` into its own component, with the pending / failed states and the retry control. Still driven only by `data-filters-pending`. | No visual change anywhere; the guard's CSS still finds every selector it names. | Existing tests, plus a browser pass on a filtered cold load of `/lens/interesting?filter.what=games`. |
| 5 | **Cut over the browse-family bodies** — `BrowseLensBrowser`, `HistoryLensBrowser`, and the dev-only `EditorialLensBrowser`: `cards`/`tagDisplay`/`cardBackedValues` come from the pool, `pool === null` renders the slice-4 skeleton. Props stay passed (unused) for now. | A lens page paints its skeleton, then its grid. `/lens/seen` and `/lens/unseen` still partition the pool exactly. | `*.island.test.ts` per body against a fake pool source; browser pass on each lens. |
| 6 | **Cut over `HomeLensSlots`** — pool from the fetch, `STALL_MS` replaced by the shared `POOL_TIMEOUT_MS`. | `/` draws its grid immediately, fills its interiors on arrival, and states a failure honestly on a blocked request. | Its existing placeholder behaviour re-verified with the request throttled and then blocked. |
| 7 | **Cut over `LensFilterShell`** — `hierarchies`/`groupOrder`/`tagDisplay` from the pool; dimension buttons disabled while pending, with a tooltip that does not lie. | The filter bar renders at first paint on every lens; a panel cannot be opened onto an empty list. | Island test on the disabled→enabled transition; browser pass. Parallel with 5 and 6. |
| 8 | **Drop the props** — `LensStackCard` stops passing the five keys; the body shims stop declaring them; `AuditLensBody` takes `tagDisplay` from the builder itself. | `/fragment/lens/home`'s island props are `lens` + `config` and nothing else. | The measurement script below, run against `dist/fragment/lens/home/index.html`. **This is the slice that banks the win.** |
| 9 | **Narrow `tagDisplay` on card pages** — at the three `CardStrip` call sites in `GenericRenderer`. Independent of 1–8; can be built at any point. | The largest card page's island props are single-digit KB, and no chip anywhere reads as a humanised slug. | `narrowTagDisplay` unit test; a chip-by-chip browser diff on a card with a series, subjects and related cards. |
| 10 | **Re-measure and record** — the table below, re-run, appended to this file and to #136. | The measured "after" column exists. | Itself. |

### "Unchanged" means normalised, not literally byte-identical

Measured while building slice 1 ([#146](https://github.com/pdyxs/pdyxs.github.io/issues/146)),
and it will bite every slice that adds a file. **Adding any module to the SSR graph rotates
every client chunk's content hash** — a `diff -rq` of two `dist/` trees then reports ~640
entries (586 `.html`, 54 `.js`) for a change that alters no output. The build itself is
deterministic (same source twice diffs clean), and the cause was isolated by probe: leaving
the whole inline pipeline in place and adding one trivial server-only re-export module
produced the *identical* diff.

So the comparison to make is **normalised HTML equality** — rewrite the hashed chunk
filenames and the derived `<astro-island uid>` values to placeholders, then diff. On slice 1
that gave 0 of 734 documents differing, with every `props` attribute byte-for-byte unchanged,
which is the claim the done-condition is actually trying to make. A literal byte diff cannot
be satisfied and must not be treated as a failure.

Slices 1–3 change no behaviour and ship no bytes; the risk is concentrated in 5–8.
Slice 4 must land before 5. Slice 8 must land after 5, 6 and 7 — until all three
consumers are off their props, removing them deletes a grid nothing has replaced.

---

## The endpoint

**Path: `/cards.json`. Plain, fixed, unhashed. Islands hardcode the string.**
([#138](https://github.com/pdyxs/pdyxs.github.io/issues/138))

- **File:** `src/pages/cards.json.ts`, a static endpoint returning a `Response`.
  Astro strips the `.ts` and the route path *is* the output filename — this is a
  `switch` in `astro/dist/core/build/common.js` (`getOutFile`) with no hook between it
  and `fs.writeFile`, not a configurable default
  ([#137](https://github.com/pdyxs/pdyxs.github.io/issues/137),
  `docs/research/cache-identity.md` on `research/cache-identity`).
- **House pattern:** `src/pages/rss.xml.js` and `src/pages/sitemap.xml.ts` are
  hand-rolled routes for exactly this reason — the payload needs `getAllCards()`, which
  only runs inside the build. Follow `sitemap.xml.ts`'s shape: gather, call a pure
  function, return `new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8' } })`.
- **A generated `*.ts` module is ruled out and the reason is load-bearing** (#135):
  `src/lib/browse-card.ts` imports `astro:assets` and calls `getImage()` per card, so
  thumbnail URLs are produced by Astro's image pipeline *during the build*. No
  standalone `scripts/*.mjs` generator can produce them, which is why the
  `lenses.generated.ts` pattern — static import, synchronous, module-graph deduped, no
  loading state — is unavailable here.
- **How the name reaches the client: it doesn't have to.** The URL is a literal.
  That is the whole point of #138's ruling.

### Why the name is fixed, not hashed

Judged on **failure mode, not bytes**. #137 proved a hash *can* reach the filename, via
a dynamic `[hash].json.ts` whose `getStaticPaths()` computes it — the reason not to is
the asymmetry:

- **A fixed name degrades to slightly newer data.** A visitor can hold a payload up to
  10 minutes newer than their cached HTML. The active card is SSR'd and never comes
  from the pool, and the listings re-render from the pool on hydration regardless. It
  **cannot produce a broken page**.
- **A hashed name degrades to no pool at all.** A cached document naming a deleted
  hash 404s. HTML is `max-age=600` and this repo ships several `content: auto-sync`
  deploys a day, so the window is hit routinely — and on `pdyxs.wtf` that 404 comes
  back `max-age=14400`, so **a miss is negatively cached for hours, not minutes**.
- GitHub Pages sends `max-age=600` for everything, filename and extension irrelevant,
  and offers no lever at all (measured against `pages.github.com` in #137). ETags are
  present and `If-None-Match` → 304 is confirmed, so a returning visitor pays one 304
  or one 43 KB gzipped body.

**The recorded upgrade path is `/cards.json?v=<hash>`** — fixed path, hashed query. The
file always exists so it can never 404, the query changes per build so a cached copy is
never wrongly reused, and it has **one** hash call site rather than two. Recorded here
so it is not rediscovered as "hashed filename" later.

**Cloudflare stays out of the spec.** `pdyxs.wtf` sits behind it and `immutable`-grade
caching is reachable there, but it lives in a dashboard outside version control that
`npm run build` does not exercise. The spec is correct under GitHub's plain
`max-age=600` either way. The *hazard* — 4h negative caching of 404s — is why the
fixed name wins and is not dropped.

---

## The payload

**Five keys, and the membership test is "is this byte-identical on every route".**
([#139](https://github.com/pdyxs/pdyxs.github.io/issues/139))

| key | astro-encoded today | plain JSON | gz |
|---|---|---|---|
| `cards` | 217.8 KB | 181.7 KB | 36.3 KB |
| `hierarchies` | 46.9 KB | 33.9 KB | 4.9 KB |
| `tagDisplay` | 23.6 KB | 18.3 KB | 3.7 KB |
| `cardBackedValues` | 15.4 KB | — | — |
| `groupOrder` | 0.1 KB | 0.0 KB | 0.1 KB |
| **asset total** | | **234 KB** | **42.8 KB** |

`lens`, `config`, `activeUid` and `initialWidth` fail the test — they are per-location
identity — and stay props.

- `groupOrder` joins despite being 100 bytes: it is always consumed by the same island
  as `hierarchies`, so excluding it would leave `LensFilterShell` taking a prop for
  nothing.
- `cardBackedValues` joins. It does not cross the wire for three lens bodies today, but
  `HistoryLensBrowser` takes it and `/lens/unseen` ships 15.4 KB of it. It is
  `cardOwnValues()` over the **unfiltered** pool, so it is route-independent.
- `hierarchies` ships **verbatim**. Structure-only was recommended, accepted, then
  **reversed on measurement**: all 235 of its values are already keys in `tagDisplay`
  and every display field agrees (235 nodes × 6 fields, zero disagreements), but the
  saving is **2.96 KB gzipped** and the cost is a signature change to two pure
  functions in `browse-helpers.ts` plus a rendering change in `DimensionPanel` — inside
  the filter-panel family that #123/#125/#126 are three rounds of cautionary tale
  about. Logged as [#143](https://github.com/pdyxs/pdyxs.github.io/issues/143).
- **The pool is narrowed nowhere.** Home needs 4 cards and `/lens/newest` caps at 30,
  but a narrowed copy is a *second asset* — a second URL, a second cache entry, a
  second loading state — to save bytes already paid for once. `newest`'s cap is a
  display rule, and the ranking chain needs the full pool to apply it.

**Free win worth stating:** Astro wraps every leaf prop value in a `[0, …]` pair, so
the wire form is **17–28% larger than plain JSON**. Moving to a JSON asset drops that
overhead on top of the dedup.

**Why per-consumer narrowing was rejected outright** (#135, do not re-run the
arithmetic): it optimises the wrong axis, leaves duplications 2 and 3 untouched, and
would cost a ranking rung. Rung 3 fires only on a tie of rungs 1–2, and **`priority`
takes exactly two values sitewide — `0` on 116 cards, `−10` on 153** — so every tie
block is the whole filtered set and the rule degenerates to per-slot filtering.

### Who serialises it

`LensStackCard.astro`'s frontmatter runs an eleven-step pipeline inline today:

`getAllCards` → `.visibility.listed` filter → `cardOwnValues` (over the **unfiltered**
list) → `getTagRegistry` → `flattenTagDisplay` → dev-only `UNINSPECTED_TAG` →
`declaredValues` → `discoverCollapseConfig` → `collapseCollections` →
`DIMENSIONS.map(d => d.nodes(nodeContext))` → `serialiseBrowseCards`.

The endpoint needs byte-identical output, so:

- **One extracted builder, called by both.** Not "the endpoint owns it and the page
  imports the route" (this codebase imports no routes), and not duplication — a drift
  between the two halves is silent, showing only as whatever the island renders being
  subtly wrong.
- **A separate pure `toSharedAsset(bundle)` does the five-key pick.** The builder
  returns the full derived bundle, because `LensStackCard` still needs
  `cardBackedValues` (as a `Set`), `declaredValues` and the collapse config
  server-side. Putting the pick in its own named function gives *"the client payload is
  an explicit pick, never a spread"* one testable home, mirroring what
  `serialiseBrowseCard` already is a level down. A spread skips excess-property
  checking, so every field later added to the bundle would join the asset silently.
- **Memoise the builder at module level**, with a comment stating why this is the
  **opposite** case to [#102](https://github.com/pdyxs/pdyxs.github.io/issues/102): a
  pure function of the content tree, identical for every page, holding no visitor
  state. The prerenderer's one-process-ness is the asset here, not the hazard. Nothing
  in this pipeline is memoised today — `getAllCards()` re-runs per route. Dev staleness
  is accepted: the dev-reload plugin already restarts the process for content-layer
  changes.

**Suggested placement** (the map does not name files): `src/lib/card-pool.ts` for the
builder — server-only, since it reaches `browse-card.ts` and therefore `astro:assets`,
the same reason `browse-card.ts` itself lives where it does — with `toSharedAsset` beside
it. `getImage()` throws if called client-side in Astro 6, so this module must never be
imported by a `.svelte` file. **Do not put a helper `.ts` under `src/pages/`**: #137
found that it becomes a route and emits a stray file.

---

## Per island

**No lens fragment server-renders a results grid any more.**
([#140](https://github.com/pdyxs/pdyxs.github.io/issues/140))

This is forced, not chosen. All the consumers are `client:load` islands taking `cards`
as a prop, and Astro renders an island server-side *from its props* and then serialises
those same props for hydration. Removing `cards` from props does not merely shrink the
payload — **it deletes the server-rendered grid**.

Two alternatives were considered and rejected. **Slot content** (the #121 real-DOM
trick) is ruled out on #121's own evidence: Svelte 5 does not adopt a slot range whose
client value differs from the server's, and the client has no cards at hydration, so
the subtree is discarded and rebuilt — a flash, the #119 bug class. **A seed prop** of
`BrowseResults`' first progressive-reveal step (~12–24 cards, ~20 KB, which the client
also holds at hydration so nothing mismatches) is *viable* and is **recorded as an
additive upgrade needing no redesign to adopt later**. It is not taken now because it
partially reverses "load once, do not narrow", needs a narrowed `tagDisplay` beside it,
and buys less than it appears to: `/` renders no cards server-side anyway, shared links
and RSS land on `/card/…`, a returning visitor on a re-ranking lens is already behind
the `data-filters-pending` skeleton, and every card is independently in the sitemap. A
first-time visitor cold-loading a lens URL is the entire cost.

**The pending state is island-internal, not a fourth CSS guard.** The existing guards
exist because the server rendered a grid the client was about to change, so CSS had to
hide real DOM until the island fixed it. With no server-rendered grid there is nothing
to hide: no attribute, no host resolution, no `closest()` clearing walk. This is
`HomeLensSlots`' shipped [#133](https://github.com/pdyxs/pdyxs.github.io/issues/133)
pattern, now used by every consumer — including **`null` is not `[]`**, which is
load-bearing rather than stylistic: without it `.fp-browse-empty` renders "no results"
while the pool is still in flight.

### The fetch

**Starts pre-hydration, from an `is:inline` promise in `Base.astro`:**

```js
window.__cardsPool = fetch('/cards.json').then(function (r) { return r.json(); });
```

The shared client module awaits `window.__cardsPool` and falls back to its own `fetch`
if absent. Under the decision above, the skeleton's duration **is** the fetch latency,
so what starts the fetch is the main lever on the state being specified — not an
implementation detail.

- `<link rel="preload" as="fetch">` alone was **rejected**: its cache-match rules (`as`
  and `crossorigin` must agree exactly with the later fetch) fail *silently*, and the
  symptom is a doubled 43 KB request nobody notices.
- Per [#122](https://github.com/pdyxs/pdyxs.github.io/issues/122), the rationale goes
  in an Astro `{/* */}` comment above the script, **not** in the script body, which is
  emitted verbatim on ~590 pages. `is:inline` bodies cost bytes per page; #122 measured
  910 gz vs 339 for one such comment.
- No `define:vars` is needed — #138 made the URL a literal.
- **The promise is client-only, so #102's SSR-isolation hazard does not apply.**
- **Fragments need no preload.** `src/pages/fragment/lens/[name].astro` sets
  `partial = true` and has no `<head>`; its islands hydrate inside a host document that
  already holds the pool.

### Per island, concretely

Production has **four** consumers, plus a fifth that is dev-only.

| island | props after | reads from the pool | pending paint |
|---|---|---|---|
| `LensFilterShell.svelte` | `lens` | `hierarchies`, `groupOrder`, `tagDisplay` | the bar renders; dimension buttons disabled |
| `BrowseLensBrowser.svelte` | `config` | `cards`, `tagDisplay`, `cardBackedValues` | the browse skeleton |
| `HistoryLensBrowser.svelte` | `config` | `cards`, `tagDisplay`, `cardBackedValues` | the browse skeleton |
| `HomeLensSlots.svelte` | `config` | `cards`, `tagDisplay`, `cardBackedValues` | its shipped #133 placeholder interiors |
| `EditorialLensBrowser.svelte` *(dev-only)* | `config` | `cards`, `tagDisplay`, `cardBackedValues` | the browse skeleton |

> **Correction — there are five consumers, not four.** The map says "the four consuming
> islands" throughout. `EditorialLensBrowser.svelte` (the `editorial` lens,
> `devOnly: true`, [#53](https://github.com/pdyxs/pdyxs.github.io/issues/53)) is a
> fifth, taking `cards`, `tagDisplay` and `cardBackedValues` exactly as the browse
> family does. It ships in no production build — `lens-components.ts` gates its loader
> on `import.meta.env.DEV` so a production build dead-code-eliminates it — so it does
> not change a single measured number or any decision. It does have to be cut over in
> slice 5, or the dev dashboard silently renders an empty page.

**`LensFilterShell`.** `FilterBar` iterates `{#each FIVE_W_DIMENSIONS as dim}` — a
static constant — and reads `hierarchies[dim] ?? []`, so the collapsed bar is already
correct with no pool and only an *opened* panel would be empty. The dimension buttons
are therefore **disabled** until the pool arrives, rather than left openable onto an
empty panel that reads as "no filters exist". `DimensionButton` already carries
`disabled={!hasNodes}`, and `hasNodes` is computed from `visibleNodesFor(dim)` — so
with `hierarchies = {}` the disabling is free. What is **not** free is its
`title={hasNodes ? undefined : 'No tags available for this dimension'}`, which would
state a falsehood for the length of the fetch: the pending case needs its own tooltip.
Note also that the shell's `enforceNoFilters` / `reportFiltersToStack` paths do not
touch `hierarchies` at all and must keep working before the pool lands — a filter
carried in the URL is the location's identity and is not the pool's business.

**`BrowseLensBrowser` / `HistoryLensBrowser` / `EditorialLensBrowser`.** Each currently
carries a `mounted` flag whose sole job is to make the hydration render reproduce the
server's full-pool SSR (the frozen-`<img>` bug documented at length in
`BrowseLensBrowser.svelte`). **With no server-rendered grid there is no render to
reproduce**, so that hazard is gone — but the flag itself is still doing a second job
in `BrowseLensBrowser` (gating `seenSnapshot`) and in `HistoryLensBrowser` (gating
`readSnapshot`, since `localStorage` does not exist server-side). Keep the snapshots;
what changes is that they now settle beside a pool arrival rather than against an
already-painted grid.

**`HomeLensSlots` needs no new states.** It already declares
`resolvedSlots = $state<ResolvedSlot[] | null>(null)` with the comment *"`null` is 'the
pool hasn't arrived'"*, and renders the real grid — real spans, rows, labels,
`See more →` — from the config alone with placeholder interiors. A fetched pool changes
its **timing, not its states**; #133 did this ticket's work for home. What must be
re-examined is its `STALL_MS = 3000`, sized against `onMount` work rather than a network
round trip. A timeout tuned for the wrong order of magnitude gives up while the fetch is
still in flight.

### Failure

**A failed fetch says so, and offers a retry.** After the timeout the skeleton stops
drawing tiles and shows an honest message with a retry control. This inherits #119's
ruling — a `filtered` guard deliberately does *not* reveal, because wrong content beats
an honest stall — and the case is stronger in both directions here: there is no content
to reveal at all, and the failure is **total** (no cards anywhere on the page) rather
than cosmetic. A fetch is also retryable in a way a hydration stall never was.

**One timeout value, shared** between the home stall and the browse-family failure,
following `FILTERS_PENDING_STALL_MS`' precedent of one number with one meaning. Name it
beside the client loader.

### What is *not* changing

- **`data-filters-pending` stays for now.** #140 opened
  [#144](https://github.com/pdyxs/pdyxs.github.io/issues/144) — if nothing
  server-renders a results grid, the whole #119/#123/#125 mechanism may be dead code —
  but that is a sweep and a removal that **cannot even be verified until this spec is
  implemented**. Until then the guard keeps its hosts, its values and its clearing
  walk, and the islands keep calling `clearFiltersPending(host)`.
- **`data-stack-resizing` is unaffected.** #126 is about the assembly's box animating
  while results are laid out against it, which still happens once the pool has landed.
- **`CardStrip` keeps its card props** (#135). They are genuinely per-page and tiny
  (1.2 KB); only its `tagDisplay` is waste. Making a four-preview strip on an SSR'd card
  page await a fetch buys 24 KB and costs a pop-in on content that renders correctly
  today.
- **`AuditLensBody` needs nothing from the asset** — dev-only, no `client:` directive,
  and it already serialises only the cards it previews. It does take `tagDisplay` as a
  prop from `LensStackCard` today, for the `BrowseCard` previews in its `not-inspected`
  worklist; when slice 8 stops passing that prop, it should read `tagDisplay` from the
  builder directly, as it already calls `getAllCards()` itself.

### Consistent with #123 by accident

A strip lens's skeleton deliberately draws no dot track, no terminal tile and no
control row, because each is a claim about how many cards matched. Under this spec that
is no longer the *filtered* case only — it is always true, since the count is never
known before the fetch. The existing skeleton needs no change; its reasoning simply now
applies universally.

---

## `LensStackCard`'s change

`src/components/LensStackCard.astro` is the shared-fetch owner for every lens today: it
runs the eleven-step pipeline and hands the results to two sibling islands. After this
change it:

1. Calls the extracted builder (memoised) instead of running the pipeline inline —
   it still needs the bundle server-side for the chrome and for `AuditLensBody`.
2. Renders `<LensFilterShell client:load lens={lens} />` — **`hierarchies`,
   `groupOrder` and `tagDisplay` are gone from that element**.
3. Renders `<BodyComponent config={lens.config} />` — **`cards`, `tagDisplay` and
   `cardBackedValues` are gone**. The four body shims
   (`BrowseLensBody`, `HomeLensBody`, `HistoryLensBody`, `EditorialLensBody`) drop the
   same props from their `Props` interfaces; `AuditLensBody` keeps `tagDisplay` only if
   it is not switched to reading the builder.

Nothing else about the component moves: the spine, both header modes, the
`body-wrapper open` structure and the `presentation` prop are untouched.

### The card-page `tagDisplay` narrowing

> **Correction — the map's measurement table records `/card/…` at 0 KB of island
> props. That is true of the *pool* and false of the *labels*** (#139). The largest card
> page ships **82 KB**, of which **43 KB is `tagDisplay` shipped twice** — once per
> `CardStrip`, both `client:load`. Across the site: **153 `CardStrip` islands on 144 of
> 298 card pages, carrying 3.56 MB of `tagDisplay` in total**. CLAUDE.md's "the card
> route is the counter-example — 0 KB of island props" needs the same correction.

**Card pages narrow `tagDisplay` at build; they do not fetch.** A card page needs a
median of **6 distinct tag values** — 0.5 KB narrowed, 2.2 KB worst case. So the trade
was: fetch 41 KB gz to use half a kilobyte, or pick the half-kilobyte at build.

Narrowing wins, and **not on bytes** — the bytes would be fetched on the next
navigation anyway. It wins on sequencing plus an existing invariant: `displayFor` falls
back to `humaniseSegment`, so a fetching card page's non-blocking path is paint-then-swap
(`Seethrough` → `SeeThrough Studios`), which is precisely the bug class #119/#123/#125
exist to prevent. That would leave a fetching card page either blocking on 41 KB or
growing a fourth guard state, on the site's most cold-entered surface (search results,
RSS, social previews, Jekyll redirects).

**Shape:** keep `tagDisplay` as a `CardStrip` prop and narrow the *data*, rather than
resolving chips server-side and changing the prop. `CardStrip`/`BrowseCard` are the same
components the lens pool uses; pre-resolved chips would fork their contract by call site.

**Where the narrowing goes — a trap the map does not name, because it is derivable
rather than a decision.** The obvious site is `card/[...path].astro`'s
`getStaticPaths()`, which is where the shared full `tagDisplay` is built once today. It
is the **wrong** site: `seriesCards` is resolved later, in `CardStackCard.astro` via
`resolveSeriesCards`, so a set narrowed in `getStaticPaths` would not cover the series
strip's preview tags — and the failure is silent and *permanent*, `displayFor` quietly
humanising every series sibling's chips.

Narrow at the three `CardStrip` call sites in
`src/components/card-renderers/GenericRenderer.astro` instead, where all three lists
(`seriesCards`, `subjectCards`, `relatedCards`) are in hand:

```astro
<CardStrip cards={seriesCards} tagDisplay={narrowTagDisplay(tagDisplay, seriesCards)} … />
```

`narrowTagDisplay(display, cards)` is a pure `Object.fromEntries` over the union of
every card's `tags` plus its `collapsedContainer`, and belongs in `src/lib/tag-display.ts`
beside `displayFor`. `GenericRenderer`'s own server-side chip rendering keeps the full
map — it costs no bytes, being an Astro-to-Astro prop.

---

## The fragment route's disposition

**`src/pages/fragment/lens/[name].astro` does not change at all, and that is a positive
constraint on the deliverable rather than a scope boundary.**
([#141](https://github.com/pdyxs/pdyxs.github.io/issues/141))

Fragments shrink **transitively**, and **no spine-only mechanism is specified anywhere.**

`/fragment/lens/home` is 98.2% island props and every byte of them is a shared key
(`cards` 206,302; `hierarchies` 42,488; `tagDisplay` 21,837; `groupOrder` 72). Only
`lens` (673 B) and `config` (429 B) survive the byte-identical test. The document falls
**408,357 → 8,628 raw / 51,593 → 2,484 gz — 47×** — and the map's worst case inverts:
the "78% is one collapsed spine" ratio becomes a spine of 8.6 KB.

The two decisions compound. The 44–50 KB left on `interesting`/`newest`/`oldest` is
SSR'd results-grid HTML, which #140 deletes anyway; `seen` is the proof, rendering
nothing for a fresh visitor and landing at 11 KB. After both, **every collapsed lens
entry is ~9–11 KB raw / ~2.5–3 KB gz** — below the noise floor of what this map is
fixing. A spine-only fragment, or skipping the fetch for an entry that renders
collapsed, would touch `initFromUrl`, the fragment route and the
placeholder/`replaceBody` contract for single-digit kilobytes.

**The constraint any future revival inherits:** the eager fetch is **not** purely a
prefetch. `initFromUrl` drops an entry whose fragment 404s — that is how the optimistic
shape self-corrects
([#101](https://github.com/pdyxs/pdyxs.github.io/issues/101)) — and a collapsed entry's
placeholder is otherwise already visually complete from the manifest title
(`placeholderTitle`, [#105](https://github.com/pdyxs/pdyxs.github.io/issues/105)). So
the fetch is easy to read as speculative and remove; doing so silently loses the 404
correction and leaves a placeholder in the fan for a location that does not exist.

**What is left after this is CPU, not bytes, and it is not on this map.** A collapsed
entry still hydrates `LensFilterShell` and `HomeLensSlots` and fully renders them behind
the card in front — nothing hides the body (`global.css:1498` records the
`display: none` rule being removed because it killed the mobile collapse animation), so
`HomeLensSlots` filters the whole pool and ranks four slots to paint a 24px title that
was already correct. That is a hydration-lifecycle question, filed as
[#145](https://github.com/pdyxs/pdyxs.github.io/issues/145) and deliberately unmeasured
until this spec is implemented.

---

## Stable selector contract delta

CLAUDE.md requires a plan to name every class, attribute and custom property it adds.

**CSS custom properties added: none.**

**Attributes added to the contract: none.** `data-filters-pending` and
`data-stack-resizing` keep their current meanings and hosts; no fourth guard attribute
is introduced (#140's decision 2 is explicitly that the pending state is island state,
not CSS).

**Class names added:** the failure state and its retry control. The map decided *that*
they exist (#140 decision 5) and left their names to the implementation; these are the
names unless a session deviates deliberately.

| name | where | why |
|---|---|---|
| `.fp-pool-error` | the extracted browse skeleton component (scoped) | the honest "couldn't load" message when the fetch fails or times out |
| `.fp-pool-retry` | same, and `HomeLensSlots` | the retry control, shared by both surfaces so one rule covers them |

Both are **island-scoped, not `global.css`** — the islands exception to
*"anything that ships in a card fragment is styled in `global.css`"*: a `.svelte`
component's styles ship with the island and hydrate wherever it lands, which is how
`.fp-skeleton*` and `.fp-slot-placeholder*` already work.

**Class names moved, not added:** `.fp-skeleton`, `.fp-skeleton--grid`,
`.fp-skeleton--strip`, `.fp-skeleton-note`, `.fp-skeleton-stalled`,
`.fp-skeleton-list`, `.fp-skeleton-card`, `.fp-skeleton-thumb`,
`.fp-skeleton-content`, `.fp-skeleton-line`, `.fp-skeleton-line--title`,
`.fp-skeleton-line--short`, `.fp-skeleton-chips`, `.fp-skeleton-chip` move from
`BrowseResults.svelte` into the extracted skeleton component in slice 4. **`global.css`
names most of them in the `data-filters-pending` / `data-stack-resizing` guard rules
(lines ~192–267), so the spellings are load-bearing and must survive the move
unchanged.** One of those rules is deliberately one selector longer than its
neighbour (`… .fp-browse-grid .fp-skeleton--strip .fp-skeleton-list`) to out-specify
Svelte's scoping hash — moving the markup to a *different* component changes which hash
is appended, so that rule must be re-verified in a browser, not assumed (#123 measured
it once already).

**Non-CSS names entering the contract:** `window.__cardsPool`, the pre-hydration promise
`Base.astro` sets and the client loader consumes, and the literal URL `/cards.json`.

---

## Test surface

The two vitest projects, and what each can and cannot reach:

**Pure, `src/lib/`, `astro` project (`*.test.ts`)**

- `toSharedAsset(bundle)` — exactly the five keys, nothing else. This is the explicit-pick
  invariant's one test; assert key *equality*, not inclusion, or a future field added to
  the bundle joins the asset silently.
- `narrowTagDisplay(display, cards)` — the union covers every card's `tags` and
  `collapsedContainer`, and drops everything else.
- The failure/timeout decision, whatever shape it takes in the client loader
  (`pending | ready | failed`) — decisions pure, effects thin, per the project's testing
  contract.
- The builder's memoisation: two calls return the same object identity.
- **The builder's output equals what `LensStackCard` renders today.** Slice 1 is a
  refactor, and the cheapest guard is a `dist/` byte diff rather than a unit test.

**`island` project (`*.island.test.ts`, happy-dom, Svelte client build)**

- Each consuming island against a **fake pool source** — the module boundary is the
  injected seam, exactly as `createCardFragments({ load })` is for the stack. Assert:
  `pool === null` renders the skeleton and no `.fp-browse-list`; the pool arriving
  renders results; a rejected/timed-out load renders `.fp-pool-error` with a working
  `.fp-pool-retry`.
- `LensFilterShell`'s disabled→enabled dimension buttons across a pool arrival.
- **Constraint:** an `*.island.test.ts` must not import a `.astro` file — there is no
  Astro plugin in that project. Every island here imports only `.svelte` and `.ts`, so
  this holds; the endpoint and `LensStackCard` are not reachable from these tests.
- `mount()` throws `lifecycle_function_unavailable` in the `astro` project. Any test
  that mounts one of these islands **must** be named `*.island.test.ts`.

**`astro` project, server render (`render()` from `svelte/server`)**

- Not needed here. #140 states it explicitly: the shared promise is **client-only**, so
  #102's SSR-isolation hazard does not apply and there is no
  `*.ssr-isolation.test.ts` analogue to write. The *builder's* module-level memo is the
  opposite case to #102 and is safe by the reasoning above; a test asserting two
  back-to-back builds agree is cheap insurance if wanted.

**Browser only (Playwright, via `/verify`)**

- That the pre-hydration fetch fires **once** — the doubled-request failure `preload`
  was rejected for is invisible to every other tool.
- The `data-filters-pending` guard rules still hitting the moved skeleton markup at the
  right specificity (see the selector delta above).
- The pending → filled transition costing no document-height jump on `/`
  (the #133 floor) and no layout shift on a lens.
- Real `fetch` failure and offline behaviour.
- View Transitions and the collapsed-fragment path generally: happy-dom has no
  `document.startViewTransition`.

---

## The measurement to re-run

The method behind every number in #135, #139 and #141: build, then parse each generated
document's `<astro-island>` elements and measure their `props` attributes. Re-run it
after slice 8 (and again after slice 9 for the card pages) so the win is **verified,
not assumed**.

```bash
npm run build     # runs the predev/prebuild generators too
```

Then, over `dist/`:

```js
// scripts/measure-island-props.mjs (throwaway; not committed)
import { readFileSync, globSync } from 'node:fs';   // globSync: Node 22+
import { gzipSync } from 'node:zlib';

for (const file of globSync('dist/**/*.html')) {
  const html = readFileSync(file, 'utf8');
  const raw = Buffer.byteLength(html);
  const gz = gzipSync(html).length;
  // Every island prop is JSON in a single HTML attribute; sum their lengths.
  let props = 0;
  for (const m of html.matchAll(/<astro-island[^>]*\sprops="([^"]*)"/g)) props += m[1].length;
  console.log(file, raw, gz, props, (100 * props / raw).toFixed(1) + '%');
}
```

Per-key figures come from the same attributes: HTML-unescape one `props` value,
`JSON.parse` it, and measure each key — remembering Astro's `[0, …]` leaf wrapping, so
compare `JSON.stringify(value[1])` for a plain-JSON figure. #141's "after" column was
produced by deleting the five shared keys from each parsed `props` object,
re-serialising, and re-gzipping the document — do the same to predict before building,
and compare against reality afterwards.

### Baseline to beat (committed `dist/`, 269 cards)

| document | today | predicted after |
|---|---|---|
| `fragment/lens/home` | 408,357 raw / 51,593 gz | 8,628 / 2,484 |
| `fragment/lens/seen` | 462,628 / 60,362 | 11,063 / 2,816 |
| `fragment/lens/interesting` | 477,147 / 59,234 | 44,372 / 6,509 → **~10,000 / ~2,800** once #140 deletes the SSR'd grid |
| `fragment/lens/newest` | 482,887 / 59,394 | 50,112 / 6,659 → same |
| `fragment/lens/oldest` | 478,932 / 59,922 | 46,157 / 7,158 → same |
| `fragment/lens/unseen` | 495,768 / 63,852 | 44,203 / 6,462 → same |
| `/` | 431,028 / 57,136 | 31,299 / 7,686 |
| `/lens/interesting` | 499,651 / 64,711 | 66,876 / 11,902 |
| `/cards.json` (new) | — | 234,000 raw / 43,800 gz, fetched once |

Card pages, for slice 9 (#139): largest today **82 KB of island props, 43 KB of it
`tagDisplay` shipped twice**; **153 `CardStrip` islands over 144 pages carrying
3.56 MB of `tagDisplay` in total**; target is a median of ~0.5 KB per strip and
~2.2 KB worst case.

The two numbers that matter most are the ones that are not in any table: **one**
`/cards.json` request per visitor per cache window, and the main-thread cost of
`JSON.parse`ing a 43 KB fetched body once instead of HTML-unescaping and parsing a
~290 KB attribute on every document.

---

## What the map left open

Stated as open rather than invented:

- **The exact loading-state markup and the names above.** #140 decided the *states*
  (pending / failed+retry / one shared timeout) and left the DOM to the implementation.
  The names in the selector-contract section are this spec's proposal, recorded so the
  contract is named as CLAUDE.md requires.
- **The timeout's value.** #140 says one number shared between home's stall and the
  browse failure, and that home's `STALL_MS = 3000` was sized against `onMount` work
  rather than a network round trip — but it does not say what the new number is. Pick it
  against a measured cold fetch of `/cards.json`, and give it one name.
- **File and symbol names.** `src/lib/card-pool.ts`, `card-pool.client.ts`,
  `buildCardPool`, `loadCardPool`, `POOL_TIMEOUT_MS` are this spec's suggestions; only
  `toSharedAsset`, `/cards.json` and `src/pages/cards.json.ts` are named by tickets.
- **An idle prefetch of `/cards.json` from a card page**, noted by #139 as a follow-on
  that would buy the cache-priming a fetch would have given with none of the sequencing
  cost. Not decided; not required.
- **The seed prop** (#140) and **`/cards.json?v=<hash>`** (#138) — both recorded as
  upgrades needing no redesign, neither taken.
- **#143** (`hierarchies`/`tagDisplay` duplication), **#144** (retiring
  `data-filters-pending`) and **#145** (deferring a collapsed card's hydration) are
  enabled by this spec and are explicitly not part of it.
