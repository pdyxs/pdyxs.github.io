# Lenses, ranking and the browse pool

## The default browse lens is Most\* Interesting, and it is uncapped

`DEFAULT_BROWSE_LENS_ID` (`src/lib/browse/lenses/lens-registry.ts`) is **`interesting`**, not
`newest`. Everything that "falls through to browse" lands there: every
`collection:` and `tag:` link, the front page's *See more →*, a filter toggled
on a lens that can't accept it, and an unresolvable old URL
(`BROWSE_LENS_FALLBACK` in `redirect-map.ts`, built from the same constant).
`ARCHIVE_LENS_ID` — where a capped strip's *See all N →* tile sends you — is the
same lens, and is still a separate constant: the default is "where a filter
lands", the archive is "the lens that shows everything", and a future default
that acquired a cap must not silently become a capped lens's overflow.

**The lens must never gain a `limit`.** ~279 of 285 cards were unreachable by
browsing because the default lens showed a slice; a `limit:` reappearing in
`interesting.lens.yaml` restores that bug silently, which is why
`lens-registry.test.ts` asserts its absence. Length is paced by progressive
reveal instead, never by truncation.

Two things are unique to it:

- **`sortKey: ranking`** is the only non-field sort. `sortCardsForBrowse`
  delegates to `rankCards` (`src/lib/browse/results/ranking.ts`) — the same comparator the home
  page's day-seeded slots and the Unseen lens use. Don't write a second ordering.
- **`note:`** is a lens-level footnote (*"\*an attempt at that, anyway"*),
  rendered by `deriveLensChrome` beside the title in card mode and hidden on a
  collapsed card. Page mode shows no lens title at all (see the lens-chrome
  section), so it carries no footnote either. It is kept a **separate string from the title**:
  `CardStack` reads `.card-header-title`'s `textContent` as a placeholder card's
  name and would otherwise name the card after its own disclaimer.

**The chain has two runtime rungs, so the browser's order can differ from the
server's.** Filter-match count and seen-ness are only knowable client-side.
This used to matter to a results grid the server had already rendered: rungs
2/4/5/6 were baked into static HTML and `BrowseLensBrowser` re-sorted it on
hydration, which — unguarded — was a whole grid visibly reshuffling a beat
after it painted. `Base.astro` carried a pre-paint script (`data-filters-pending`)
whose whole job was covering that reshuffle, plus the equivalent gap on a
client-side lens transition (`filtersPendingForTransition`,
`src/lib/filters-pending.ts`, issue #125).

**That entire mechanism is gone (#144).** The shared-card-pool map (#136)
removed the thing it existed to hide: no lens fragment server-renders a results
grid any more (map #140), so every browse-family body (`BrowseLensBrowser`,
`HistoryLensBrowser`, `EditorialLensBrowser`) renders nothing until its own
`/cards.json` fetch resolves, and `sortedCards`/`resultCards` already reflect
both runtime rungs the very first time they render. There is no reshuffle to
cover, on a cold load or a transition, so `Base.astro`'s pre-paint script,
`src/lib/filters-pending.ts`, and the `data-filters-pending` rules in
global.css were deleted outright rather than left dormant. See "The card pool
is fetched once per visitor" below for what replaced the loading state itself.

**A lens change still animates the REAL BOX, and still holds its results
behind the skeleton while it does** (issue #126) — this survives, because it is
a fact about the box, not about who rendered the cards. `.card-stack-inner`'s
`width` is transitioned over `--stack-motion-ms`, so the incoming lens's grid
would otherwise be laid out at every width between the outgoing card's and its
own: at 1400px, `repeat(auto-fill, minmax(280px, 1fr))` held **two** columns
for 450ms and then reflowed to three — the 1877px collapse, measured
independently of the (now-removed) hydration re-sort.

#125 answered that by *suppressing* the width transition on a replace. #126
found the cost: the view transition that spanned the swap was then the only
thing moving, and a VT paints **snapshots** (the UA stylesheet stretches
`::view-transition-old`/`-new` to `inline-size: 100%` of a group animating
between the two rects), so the header was being **scaled as a bitmap** —
680px → 960px in one frame under a 514ms transition. Back never did that: a
popstate rebuild leaves `.card-stack-inner` alive and its width transition
simply runs, over ~443ms of real layout.

So `replaceSlot` has **no view transition at all** any more. It commits
synchronously, exactly as a popstate does, and the surviving `.card-stack-inner`
carries the resize. Three consequences worth stating:

- **The fresh slot was never the problem.** `.card-stack-inner` is outside the
  keyed `{#each}`, so it survives a node swap the same way it survives a
  rebuild. Reusing the outgoing handle would hit the outgoing fragment in the
  cache and never fetch — that rule stands untouched.
- **Two lenses of the same width now swap instantly** instead of crossfading
  (every lens but home declares 960px). That is what Back between them already
  did, and one vocabulary was the ask.
- **The churn is held, not re-admitted.** `data-stack-resizing` (owned by
  `holdWhileAssemblyResizes`, named in `src/lib/stack/layout/stack-motion.ts`) goes on the
  incoming `.stack-card` and shows the #119/#123 skeleton in place of the
  results list, empty message and count for as long as the resize runs. It used
  to be a **second** attribute alongside `data-filters-pending` — a second,
  independent reason to be holding the same four elements back, since that
  guard was cleared by the lens island the moment its own order committed,
  which said nothing about whether the box it sat in had stopped moving. That
  guard is gone (#144), leaving `data-stack-resizing` as the sole reason this
  results area is ever held back.

The hold is **asked, not predicted**: the commit has run, one forced layout pass
creates whatever transition it started, and `widthTransitionOf` either finds a
`width` CSSTransition on `.card-stack-inner` or does not. Three cases release
immediately by that one route — equal declared widths (lens → lens), mobile
(`display: contents`, no box), and reduced motion (`--stack-motion-ms` is 0ms
and a zero-duration transition is never created). None can stall, and no
`transitionWillFire` check or timeout is needed.

The last piece is that **the resizing card's content is laid out at its
destination**: `.stack-card[data-stack-resizing] .stack-card-body-inner` is
pinned to `--stack-card-width`, which is an *unregistered* custom property and
therefore holds its final value from the commit while the `width` it feeds
animates towards it. Without it even the placeholder re-columned mid-flight
(measured: 1652 → 1839 → 1263 over one 430ms resize). With it the document
height is flat across the whole resize. Page mode gets its own copy of the rule
without the `- 2 * var(--border-width)`, because a page-mode card has no border
and would otherwise settle with a 2px snap.

A **push** is unchanged in every respect — it keeps `panel-card-open`, and it
keeps its width motion: the fan really does shift a slot, and "the fan glided,
the cards jumped" is the failure that transition was added to fix.

**Back/Forward takes the same assembly-resize hold** (issue #127; it used to be
two holds — see below). It was added on the `replaceSlot` path only, and a
popstate never went through that path either. Measured forward-again into
`/lens/interesting?filter.what=art` — the grid re-columned *during* the resize
and the document collapsed 6003px → 1938px. Masked in the direction people try
first, because Back from a filtered lens goes to `/`, which has slots rather
than a results grid.

`holdIncomingActive` (`CardStack.svelte`) is where it sits, which is the whole
of the ruling. A popstate rebuilds the stack **wholesale** —
`seedStackState(null)`, then `initFromUrl` — so there is no "incoming entry" to
hand it the way a replace has; it reads the ACTIVE location back out of the
store after the commit, and asks for the hold on **only that one**:

- a `from`/`to` entry arrives **collapsed**. It is a spine with no results grid
  to hold, and the `data-stack-resizing` body pin would act on a body nobody can
  see — so only the active location is ever asked.
- a popstate can land on a **card**. The assembly hold is about the *box*, not
  the lens, so it is asked either way and answers "no transition" for the
  equal-width case that card → card usually is.

(It used to also flag the incoming lens against the `data-filters-pending`
guard here — `filtersPendingForTransition` returned null for a card, so a
popstate landing on one was already excluded before that guard was removed
outright in #144.)

Both `onPopstate` branches therefore `flushSync` their commit — the same reason
`replaceSlot` does, that the island mounts when its node is inserted and the
hold has to be asked for in the same task — and call it **before**
`initFromUrl`. `initFromUrl`'s splice does not restart the resize:
`--stack-card-width` is `min(--max-width, viewport − fans)`, and only the
`--max-width` half is what changed.

It is **not awaited**. `rebuilding` gates whether the correcting scrolls
animate, and holding it true for the length of the resize would make a
navigation started inside that window scroll instantly — the hold manages its
own attribute lifecycle and has nothing to say to the scroll owner, whose
signature a popstate deliberately clears.

## The ranking comparator is a chain, not a score

`compareCards` (`src/lib/browse/results/ranking.ts`) is what "Most\* Interesting" sorts by. Six
rungs, each consulted only on a genuine tie above it, so any card's position is
explainable by naming the rung that placed it:

1. **filter-match count, descending** — `countSelectedValueMatches`
   (`src/dimensions/apply.ts`)
2. **`priority`**
3. **unseen before seen**
4. **`order`**, only between two cards sharing a folder
5. **that folder's declared `sort`**
6. **uid**, for determinism

Rungs 1 and 3 are **runtime** (filters change, seen-ness is per-visitor) and
arrive as accessors on the context; 2, 4, 5 and 6 are decided at build and ride
on `CardMeta` — which is why `priority` and `sort` are required fields on
`SerialisedCard` too. The comparator itself runs in the browser.

Priority sits **above** seen deliberately: the other way round, an authored
boost quietly stops mattering to exactly the returning visitors it was aimed at.

`order` keeps its existing meaning — sequence *within* a folder. It is not
overloaded into a global priority, which is why rung 4 only fires between two
cards of the same folder.

Results are **not** grouped by folder. Rung 5 fires only between adjacent
same-folder cards — which is exactly what boosting a folder produces.

## One seen concept, keyed two ways

`src/lib/stack/state/card-view-state.ts` records exactly one thing: **did the visitor open
this card?** There is no "displayed" state — a card appearing as an excerpt
leaves no trace at all. (It used to: `markDisplayed` removed the card from the
unseen tier, re-rolling the day-seeded home pick, so the tier existed mainly to
undo its own churn. Its one real job — walking the visitor through the unseen
set — was given up **deliberately** in #83: if you were shown a card and didn't
open it, the front page failing to show it again is the bug, not the repetition.)

The one entry answers two questions, and they are keyed differently on purpose:

| question | key | reader |
|---|---|---|
| is this unseen? | `uid` + `contentHash` | `getViewState` |
| when was it read? | `uid` alone | `getReadAt` / `hasBeenRead` |

Editing a card changes its hash and returns it to `unseen` — "this changed, look
again" is the feature, and it is what feeds rung 3 of the ranking chain. But a
card you definitely read vanishing from your history because the author fixed a
typo is a lie, so `readAt` ignores the hash entirely. The hash affects
*freshness*, not *whether it happened*.

`readAt` is the **most recent** read, and is **absent** on state written before
#83. Missing means "read, at an unknown time", never "not read" — sort it last
(`compareReadAt`), never at the epoch end where it would claim to be the oldest
thing the visitor ever read. Legacy `displayed` entries decay to `unseen`; they
are left in localStorage rather than swept, and are overwritten the moment the
card is actually read.

Writes go through `markRead`, called only from `CardStack.svelte` — the same
invariant as every other card-stack mutation.

## Home slots are the ranking chain, day-seeded

A home filter slot is **the top `pool` cards its filter leaves, with the calendar
day picking between them** (`selectSlotCard`, `src/lib/browse/home/slot-selection.ts`). The
ordering is `rankCards` — the site's one comparator, not a second selection rule
— so authored `priority` decides what is eligible and the day decides which of
those you get. `pool` is declared per slot in `src/content/what/home.lens.yaml`;
`DEFAULT_SLOT_POOL` (5) when absent.

## A lens names itself; the page header names the site

Two strings, two owners, both decided in `deriveLensChrome`
(`src/lib/browse/lenses/lens-chrome.ts`):

- **The page-mode subtitle is the SITE's**, authored as `subtitle:` on the home
  lens (`src/content/what/home.lens.yaml`) and identical on every lens page. It
  used to be the lens's own label, which made the site header say what you were
  currently browsing rather than what the site is. Page mode is the ROOT of the
  stack — there is nothing to disambiguate there — so the lens's own name is not
  rendered in it at all, footnote included.
- **The card-mode title is the lens plus its filters** (`Newest · Puzzles`),
  because a lens location's identity *is* the lens plus its filter set
  (`lens-key.ts`). Two views of Most\* Interesting can sit in one stack, and
  the title is the only thing on screen that tells them apart.

Home is the exception at both ends: its card title is the site title (it is the
stack root, and its spine is the site's branding), and it accepts no filters.

**The filtered half of the title can only be applied on the client.** A
fragment is fetched by uid — `/fragment/lens/newest` — so the server always
renders the lens unfiltered, and a filter toggle re-keys an entry whose HTML
landed long before. `lensChromeForKey` turns a location key back into the
title; `applyLensTitle` in `CardStack.svelte` writes it into the two places a
fragment names itself (its `.card-header-title` and its
`.stack-card-spine-title`), from the layout effect — the store→DOM applier, and
a re-key is a store change like any other. It runs **again after every
`replaceBody`**, whose `syncTitles` has just copied the fetched fragment's
unfiltered title onto the kept header. `titleForSlot` is the same decision for
a pile band's label, which reads the fragment cache rather than the DOM.

## A capped lens browses as a strip, and the cap is what makes it work

Newest and Oldest are timelines, not grids: `display: strip` plus `limit: 30`
in the lens `config` (`src/content/when/*.lens.yaml`), decided by `isStripLens`
(`src/lib/browse/lenses/strip-lens.ts`) and applied by `BrowseResults`'s `layout` prop, which
swaps the wrapping grid for a `CardStrip` — the same component as "Cards about
this" and the series run.

**The cap protects the dot track.** `computeStripDots` emits one dot per card,
positioned proportionally; at 154 cards on a ~600px track that is a dot every
4px — a solid line carrying no information. Raising or removing the limit
silently degrades the strip's best feature rather than breaking anything, which
is why `lens-registry.test.ts` asserts both keys.

**Each lens is anchored by its own sort, not by scrolling.** Newest sorts
descending and Oldest ascending, so in both the anchor card is index 0 and the
run reads outward from it — Newest away from now, Oldest forward from the start.
No `scrollLeftForCard` call and none of its one-frame-late trap; the terminal
tile lands at the far end, where scrolling naturally takes you.

**The terminal tile is the door to the archive, and a fade is not.** A gradient
edge reads as "scrollable", which the strip already is, and cannot distinguish
"you have seen all 12" from "this is 30 of 154". `stripTerminal` decides it:
the label states the **true match count** (`filteredCards.length`, the same
value `BrowseResults` reports in its count line — never the rendered 30), and
the tile is a `<button>` carrying `data-replace-slot` / `data-replace-params`,
so `CardStack.svelte` swaps the lens and carries the active filters across.

Its target is `ARCHIVE_LENS_ID` (`interesting`, issue #81) and `archiveLensId()`
returns **null until that lens is declared**, which omits the tile entirely.
That is deliberate: a capped lens can only honestly hand off to an uncapped one,
and falling back to `DEFAULT_BROWSE_LENS_ID` would point at `newest` — itself
now capped. Authoring `src/content/what/interesting.lens.yaml` is the whole of
the hookup.

Two smaller things the strip layout implies. Dots are computed from
`extents.slice(0, cards.length)`, because the terminal tile is a child of the
scroller and would otherwise claim a dot it isn't a card for. And the row's
height is the tallest card in the *whole* run, not the tallest one on screen —
already true of every strip, but far more visible over 30 heterogeneous cards
than over a six-chapter series.

**Its anti-FOUC skeleton states nothing about the count** (issue #123). #119's
guard names `.fp-browse-list`, so a filtered cold load of a strip lens painted
the unfiltered run at first paint and kept it for ~880ms — the literal original
report. The strip's skeleton reuses the `.fp-skeleton*` tiles in one clipped
row (`.fp-skeleton--strip`, four tiles so the fourth is cut off at the edge)
and deliberately draws **no dot track, no terminal tile and no control row**:
each of the three is a *claim about how many cards matched*, which is exactly
the number the page does not have until the island hydrates. A wrong number is
worse than no number, and a track re-laid-out from 30 dots to 17 is the visible
half of the bug.

Two things about how it is guarded. The strip rules key on the guard's
**value** — `filtered` / `stalled`, never the bare re-rank `""` — because a
strip lens sorts on date and never re-ranks, so holding its run back for a
returning visitor would buy a skeleton flash for a swap that cannot happen.
And the stalled rule that hides the row is spelled one selector longer than the
grid's: the strip's `display: flex` is a *scoped* rule, and Svelte's scoping
appends its hash class to every compound, which out-specifies the plain global
one. Measured, not assumed.

## The history lenses partition the pool on `uid` alone

Seen and Unseen (issue #84) are one body — `HistoryLensBrowser.svelte`, keyed
`history` in `LENS_BODY_LOADERS` — told apart by `config.readState` in their
YAML. Both are filed under `when`: Seen sorts on time, just the visitor's clock
rather than the publication date, and Unseen is filed with it for the complement
(it has no sort of its own — it is `rankCards`, like everything else).

**Both key on `uid` alone** (`hasBeenRead`), never on `uid + contentHash`. So a
card you read that the author has since edited stays in Seen and stays out of
Unseen, and the two lenses **partition the browse pool exactly** — every card is
in one of them, and none is in both. That is the ruling, and the reasoning is:
Seen is a record of what you did, which no edit can undo; Unseen is a to-read
list, and if edits pushed cards back into it, it could never empty and would
lose its ending. "This changed, look again" is not given up — it already lives
in the hash-*sensitive* `getViewState` behind rung 3 of the ranking chain, so an
edited card floats back up the ranked lenses. **Freshness is a ranking signal;
membership here is a fact about the visitor.**

They are the only lenses that decide their content entirely client-side, and
that is fine *here* in a way it is not for the default browse lens: neither is
a link target, and an empty Seen lens is the **correct** rendering for a
first-time visitor. The pre-mount render is an empty history, which is both what
the server must render and what is honestly true of a browser that has never
been here — so Unseen prerenders the full pool and Seen prerenders nothing.

Because empty is the *common* state at launch, the message is decided from the
**reason**, by `historyEmptyMessage` (`src/lib/browse/lenses/history-lens.ts`), with
`anyHistory` / `anyUnread` read from the **unfiltered** pool: "you haven't
opened anything yet" and "you have read everything" are claims about the site,
and a filter excluding your history is a different thing entirely. `BrowseResults`
takes the result as `emptyMessage` (defaulting to the filter wording).

One thing worth knowing about the cutover: a returning visitor does **not** see
an empty Seen lens. Pre-#83 entries are reads with no `readAt`, and `hasBeenRead`
counts them — they show up, sorted last by `compareReadAt`, which is exactly the
graceful degradation #68 asked for. Membership is `hasBeenRead`, never
`getReadAt() !== null`; the latter would silently delete history on day one.

## The card pool is fetched once per visitor, not shipped per island

`/cards.json` (map [#136](https://github.com/pdyxs/pdyxs.github.io/issues/136),
spec `docs/plans/shared-card-pool.md`). The site's browse data used to travel as
`<astro-island>` props: 223 KB of `cards` **byte-identical on every lens route and
every lens fragment**, three times over on a single lens page, re-sent by every
fragment, and structurally uncacheable because it lived in HTML. An ordinary stack
URL was three documents totalling 524 KB, 78% of it hydrating two islands carrying
the whole pool to render a 24px collapsed spine. Measured after: **17,185,599 →
1,475,772 B of island props site-wide**, and `/fragment/lens/home` from 466,437 to
13,610 raw.

**The filename is fixed and unhashed, and that is a ruling.** `src/pages/cards.json.ts`
is a hand-rolled static endpoint for the same reason `/rss.xml` and `/sitemap.xml` are
— the payload needs `getAllCards()`, which only runs inside the build, and the
`lenses.generated.ts` pattern is unavailable because `browse-card.ts` calls
`getImage()` per card, so thumbnail URLs come out of Astro's image pipeline *during*
the build. Astro strips the `.ts` and the route path **is** the output filename
(`getOutFile`, a `switch` in `astro/dist/core/build/common.js` with no hook before
`fs.writeFile`), so the file's own name is the whole of the contract and islands
hardcode the literal. The choice was made on **failure mode, not bytes**: a fixed name
degrades to a visitor holding a payload slightly newer than their cached HTML, which
cannot produce a broken page (the active card is SSR'd and never comes from the pool,
and the listings re-render from the pool on hydration anyway). A hashed name degrades
to **no pool at all** — a cached document naming a deleted hash 404s, and on
`pdyxs.wtf` that 404 comes back `max-age=14400`, so a miss is negatively cached for
*hours* against HTML's ten minutes. The recorded upgrade path, if one is ever wanted,
is `/cards.json?v=<hash>` — fixed path, hashed query, one hash call site instead of two.

**Six keys, and the membership test is "is this byte-identical on every route".**
`cards`, `tagDisplay`, `hierarchies`, `groupOrder`, `cardBackedValues`, and
`seriesMembers` (added for collapsed-series read tracking — see below). `lens`,
`config`, `activeUid` and `initialWidth` fail it — they are per-location *identity* —
and stay props, which is why a lens document still carries 485–819 B and `/` carries
3,754 B of `config.slots`. Two keys join on the test rather than on size:
`groupOrder` is 48 bytes but is always consumed by the same island as `hierarchies`,
and `cardBackedValues` crosses the wire for only one body today but is
`cardOwnValues()` over the **unfiltered** pool, so it is route-independent. **The pool
is narrowed nowhere**: home needs 4 cards and `/lens/newest` caps at 30, but a
narrowed copy is a *second asset* — a second URL, a second cache entry, a second
loading state — to save bytes already paid for once, and the ranking chain needs the
full pool to apply a cap that is a display rule.

**The fetch starts before hydration, and `<link rel=preload>` was rejected for that
job.** An `is:inline` script in `Base.astro`'s `<head>` sets
`window.__cardsPool = fetch('/cards.json').then(r => r.json())`, and
`src/lib/browse/results/card-pool.client.ts` **adopts** that promise, falling back to its own `fetch`
only where there isn't one (a fragment injected into a host document that predates the
script, a test, an island rendered outside a page). A preload link's cache-match rules
— `as` and `crossorigin` must agree exactly with the later fetch — fail **silently**,
and the symptom is a doubled 48 KB request nobody notices. `??` rather than `||` at the
adoption site for the same reason: a falsy-but-present value is still a document that
already tried.

Three things about the loader that are load-bearing:

- **The pre-hydration promise is a ONE-SHOT.** `window.__cardsPool` is a settled
  promise for the life of the document, so a *failed* one hands back the same
  rejection forever — every retry would re-read the original failure and no request
  would ever be made. Once an attempt fails the loader stops consulting it and fetches
  for itself. Measured in a browser with `/cards.json` aborted: without that,
  "Try again" cannot succeed even after the network comes back.
- **A success is kept for the document; a failure is dropped.** That single-flight
  asymmetry is what makes the retry control real, and it is why there is exactly **one
  retry control per fetch** — not one per cell. The loader is the unit that failed, so
  it is the unit that retries, and a grid of per-card retry buttons would fire N
  requests for one shared asset.
- **The six keys are checked as a shape, not trusted.** GitHub Pages serves a 404 as
  an HTML document. Most of those die in `JSON.parse`, but "parsed to *something*" is
  not "is the pool", and an island handed `{}` renders an empty site with no error
  anywhere. `isSharedCardPoolAsset` converts that into a visible failure.
  `POOL_TIMEOUT_MS` is 8000 — one number shared between home's stall and the browse
  family's failure state, and deliberately larger than the 3000ms `STALL_MS` it
  replaced, which was sized against `onMount` work rather than a network round trip.

**No lens fragment server-renders a results grid any more.** Each island renders
`pool === null ? <BrowseSkeleton /> : results` from its own template, so the results
area has exactly one owner and the pending state is not a second copy of the grid
markup. That is also what makes the fragments 40× smaller than a grid-shipping
fragment could ever be.

**`.fp-skeleton--pending` and `.fp-skeleton--failed` exist because there is no CSS
guard left to turn this box on.** The base rule is `.fp-skeleton { display: none }`.
The `data-filters-pending` guard that once flipped it — for a *filtered* cold load and
for a lens transition — was removed entirely in #144, once the shared card pool made it
provably dead: it existed to hide a server-rendered results grid the client was about
to re-sort, and no lens fragment server-renders one any more. A body rendering the
skeleton because it has no cards yet needs *something* to turn the box on, so the
pending box turns *itself* on, exactly as the failure box does: this is **island state,
not a CSS guard**. The `data-stack-resizing` rule (issue #126) can still reveal the same
box from outside, while a lens change's assembly is resizing — harmlessly, since both
say `display: block`.

**Card pages narrow at build; they do not fetch.** A card page needs a median of 6
distinct tag values, so the trade was "fetch 48 KB gz to use half a kilobyte" against
"pick the half-kilobyte at build". Narrowing wins, and **not on bytes** — those bytes
would be fetched on the next navigation anyway. It wins on sequencing: `displayFor`
falls back to `humaniseSegment`, so a fetching card page's non-blocking path is
paint-then-swap (`Seethrough` → `SeeThrough Studios`), which is precisely the bug class
#119/#123/#125 exist to prevent, on the site's most cold-entered surface (search
results, RSS, social previews, Jekyll redirects). `narrowTagDisplay`
(`src/lib/content/tags/tag-display.ts`) is the decision — the union of the previews' own `tags` plus
each card's `collapsedContainer`, which is exactly the set `BrowseCard` resolves out of
the map. It keeps `tagDisplay` as a `CardStrip` prop and narrows the *data*; resolving
chips server-side would fork `CardStrip`/`BrowseCard`'s contract by call site.

**The trap, and it is silent and permanent:** the narrowing goes at the three
`CardStrip` call sites in `GenericRenderer`, **not** in `card/[...path].astro`'s
`getStaticPaths()` where the full `tagDisplay` is built. `seriesCards` is resolved
later, in `CardStackCard.astro` via `resolveSeriesCards`, so a set narrowed in
`getStaticPaths` would not cover the series strip's preview tags — and nothing would
report it. `displayFor` would simply humanise every series sibling's chips forever.

What remains on a card page is `CardStrip`'s **card** props, kept by design: 24,512 B
on `/card/where/work/seethrough`, whose "Cards about this" strip is the 25-card
SeeThrough affiliation closure. The spec's "~1.2 KB per strip" is right for a typical
strip and an order of magnitude low for the biggest closures.

## A collapsed series can show two entries: the whole, and what's left to read

`collapseCollections` (collapse.ts) runs once, at build time, on the server — it has
no notion of any particular visitor, so it can only ever emit ONE representative per
collapsed folder. Whether a visitor should see one entry or two is a question about
THEIR read history, which exists only in their browser. So this is a second,
client-side expansion pass, `expandCollapsedSeries` (`src/lib/browse/results/collapsed-series.ts`),
run wherever a browse-family body consumes the shared pool.

The rule: the representative is always kept, and its own read state — as far as
ranking and the history lenses are concerned — is **"has ANY member of the series
been read"**, not just whether the representative's own uid was opened directly.
Reading chapter 3 of a 6-chapter series counts the whole series as read even though
the representative still points at chapter 1. A SECOND entry is added only when that's
true AND at least one member remains unread: the first such member, in series order,
as a real un-collapsed card — own title, own tags, own thumbnail — behaving exactly
like any other card wherever it lands (filtering, ranking, the browse grid).

**This is why `seriesMembers` exists as a sixth shared-pool key.** The client needs
each collapsed folder's real membership (not just its one representative) to compute
either half of the rule, and a member is dropped from `cards` entirely by
`collapseCollections` — there is nowhere else to get it from. `collapsedSeriesMembers`
(collapse.ts) computes it from the SAME per-folder resolution `collapseCollections`
uses (`resolveFolder`, shared between the two) so the representative's uid this key is
keyed by can never disagree with the one `cards` actually carries. Folders with fewer
than two members are omitted — there's nothing to distinguish from the representative.

**It is a pure, re-derived computation, not a stored fact.** Nothing is written to
`localStorage` to represent "the series is read" — `isSeriesRead`/`expandCollapsedSeries`
re-check every member's current read state on every call. The alternative (propagating
a write to the representative's own address whenever any member is read) was rejected:
it would create a second, parallel copy of "is this series read", which could drift
from the true per-member states — e.g. if the one chapter actually read is later
edited and its own hash-aware check reverts, a propagated write would leave the series
stuck showing "read" with nothing to un-stick it. Recomputing live has no such state to
drift.

**One function, two read concepts, by design.** `isRead` is injected so the same
`expandCollapsedSeries` serves both of the site's existing "seen" concepts (see "One
seen concept, keyed two ways" above) without hardcoding either: hash-aware
`getViewState` for the ranking chain (rungs 2 and 4 — `BrowseLensBrowser.svelte`,
`HomeLensSlots.svelte` via `selectSlotCard`'s injectable `isSeen`), and uid-only
`hasBeenRead` for the Seen/Unseen lenses (`HistoryLensBrowser.svelte`), which partition
on uid alone for the same reason every other card does (an edited-but-read chapter
must stay in Seen). A representative's `readAt` for the Seen lens's own sort is the
**most recent** read among its members (`mostRecentReadAt`, card-view-state.ts), for
the same reason — the representative's own address may never have been the one
actually opened.

Deliberately NOT wired into `EditorialLensBrowser.svelte`: that dev-only dashboard
groups by publish status, not read state, and has no isSeen concept to begin with.

## Progressive reveal appends; it never windows

`BrowseResults` renders a leading slice of a **grid** and asks for the next step
from an `IntersectionObserver` sentinel with a deliberately generous
`REVEAL_ROOT_MARGIN`, so the reader never arrives at an end. Decisions are pure
in `src/lib/browse/results/progressive-reveal.ts`; the observer and the fallback button are the
thin applier. On by default for every grid lens (`revealSettings()` — a lens
opts out with `reveal: false` or resizes the step with `reveal: <n>`); a short
result set costs nothing, since with nothing held back neither the sentinel nor
the button renders.

Four things that bite:

- **Never virtualise.** Removing DOM nodes on scroll invites `contain: paint` or
  `will-change: transform` on the scroll container, and per the dither rules in [styling.md](styling.md)
  above that re-anchors every dithered surface inside it and brings the shimmer
  back. Thumbnails are already `loading="lazy"`, so reveal buys DOM weight and
  fetch pacing — not first-paint bytes.
- **Reveal position is a step COUNT, not a card count.** SSR runs no effects, so
  a card count would have to be seeded from a prop (which Svelte warns about);
  step zero needs no seeding.
- **The sentinel lives outside `.fp-browse-list`.** The anti-FOUC guard hides
  that list with `display: none`, and an element with no box never intersects —
  inside it, the reveal would never start on a filtered cold load.
- **Re-arm the observer after every step.** `IntersectionObserver` reports only
  a *change*; if the sentinel is still inside the root margin after the append
  it sits there intersecting and never fires again. `unobserve` + `observe`
  forces a fresh callback against the new layout.

The strip lenses answer the same question differently — a hard `limit` plus the
terminal *See all N →* tile (`strip-lens.ts`). `BrowseResults` ignores `reveal`
in strip layout for that reason.

