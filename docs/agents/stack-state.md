# The card stack: state, fragments, history

Who owns the stack, what an entry is, how a location's HTML gets there, and what
the URL says about it. Layout, motion and scrolling live in
[stack-layout.md](stack-layout.md).

## CardStack.svelte owns all card-stack mutations

Any code that pushes, collapses, expands, reorders, or hides cards goes through `src/components/CardStack.svelte`. `src/components/StackNav.astro` is a thin Astro shell that renders `<CardStack client:load />` — it has no `<script>` block. Renderers and other scripts must not reach into `#card-stack` directly. This keeps the VT lifecycle, state, and layout updates in one place.

## `from` and `to` belong to the stack, never to a location

The codec owns two query keys — `from` and `to` — and they describe the *shape
of the stack*: which locations sit before and after the active one. Everything
else in the query belongs to the active location, either as its identity (a
lens's `filter.*`, which rides in its key) or as side state it carries (a card's
`tab=bio`). `STACK_STRUCTURE_PARAM_KEYS` and `locationParamsFromSearch`
(`src/lib/stack-codec.ts`) are that one distinction, and **every** path that
turns a query string into a location's params goes through it — the codec's own
`deserialiseStack`, `CardStack`'s mount seed, `onPopstate`, and
`pushFilteredLens`.

Drawn in only one of those places (issue #103), the two paths that rebuild from
a URL adopted the stack's own context as the location's side params. That is not
a cosmetic duplicate: `cardParams` is keyed by identity, so the stolen pair was
re-emitted on **every** later `serialiseStack`, beside the structural pair
computed from the live stack. The stale copy then wins wherever the live stack
emits nothing — a `to` left over from a deeper visit resurrects entries the
visitor has since closed — and rides inside the location's own `~`-token when
it is inactive, compounding a level per navigation. Back/forward was where it
showed, because those are the two navigations that rebuild rather than mutate.

The second half of the same rule: **a popstate rebuilds the side map too.**
`onPopstate` throws the entries away (`seedStackState(null)`) and `initFromUrl`
reads them back, so `cardParams` is reset in the same breath. Every side param
was serialised into the URL by the `updateUrl` that wrote that history entry, so
the URL is the complete record; anything surviving in the map belongs to the
stack the visitor just navigated *out of*, and would be re-attached the next
time a same-keyed location appeared.

## A cold-loaded stack states its shape before it knows its contents

A deep link renders only its **active** location server-side; the `from`/`to`
entries are client-side. `initFromUrl` used to await each fragment and splice
its entry in when the HTML landed, so a shared link painted the active card
alone and then grew a fan one card at a time — moving the card you came to read
on every step. Three things fixed that (issue #101), and they are independent:

1. **The shape lands first.** `deserialiseStack` already knows every entry, so
   every one of them gets a `seedPlaceholder` and the store takes them all in
   **one write**. Fetches then run in parallel and fill each card in place.
2. **The titles are real.** `stack-manifest.json` carries a `title` per entry
   now, so a collapsed `from`/`to` card — which *is* its spine title — is
   legible before any fragment arrives. Codes are append-only (`assignCodes`);
   titles are refreshed wholesale every run (`withTitles`). Two rules, two
   functions, deliberately: folding them together invites the wrong one.
3. **The geometry is reserved pre-paint.** An inline script in `Base.astro`
   sets `--behind-slots` / `--behind-rows` / `--ahead-slots` / `--ahead-rows` on
   `<html>` before first paint. Without it the active card jumps 60px right and
   40px down (measured, three-slot fan at 1400px) when the island hydrates.

Four things that bite:

- **The fill-in MUST go through `replaceBody`.** `StackFragment` reads its
  `html` prop once, so a bare `seed` would cache the real fragment and leave
  the card showing its skeleton for the rest of the session. This is asserted
  as an absence in `CardStack.fragments.test.ts`, because a behavioural test
  would see the right HTML in the cache either way.
- **The inline script computes no geometry.** `fanReservationTable`
  (`src/lib/stack-reservation.ts`) builds a lookup table by calling
  `computeGeometry` itself, and `Base.astro` bakes it in at build time via
  `define:vars`; the script counts `from`/`to` entries and reads a row. The
  slots-vs-rows distinction — a piled card shares its slot's `left` but keeps
  climbing in `top` — therefore has exactly one implementation. It has already
  been got wrong once; a second copy in an un-importable inline script is how
  it would be got wrong again, silently, as a layout shift.
- **The table saturates, and its last row is the first saturated one.** Past
  the fan's cap a side's slots stop growing and its rows stop one pile-depth
  later, so six rows per side covers every stack that can exist and
  `reservationFor` clamps. One row shorter and the clamp starts lying.
- **`is:inline` script bodies are emitted verbatim, comments and all**, on
  every one of ~590 pages. The rationale for that script lives in an Astro
  `{/* */}` comment above it, which is stripped at build. Leaving it inside
  cost 910 bytes gzipped per page instead of 339.

The shape is **optimistic**, so a location whose fragment 404s is removed from
the store again — which is what the sequential version expressed by never
splicing it in.

## Fragments are HTML; the stack is state (`src/lib/card-fragments.ts`)

The other half of that invariant. A location is rendered server-side as one
`.stack-card`, and everything the client knows about it — title, declared
width, content hash — travels as markup. `createCardFragments` owns all of it:
uid ↔ URL mapping, the cache, every read of a fact out of a fragment
(`factsFor`), the placeholder a view transition starts against
(`seedPlaceholder`) and the later swap of real content into it (`replaceBody`).
`CardStack.svelte` contains no `createElement`/`innerHTML` parsing — guarded by
`CardStack.fragments.test.ts` — and the module contains no stack state: it
never imports the store and never decides what is active.

**A placeholder's shell is permanent; only its body is transient.**
`replaceBody` swaps the body and nothing else, because the header is what a
view transition is morphing into and the sticky-header observer (#110) holds
`.card-header` by reference — replace either node and the animation or the
`card-header--stuck` toggle is left pointing at a detached element. So the
titles are copied *into* the kept nodes instead (`syncTitles`), header and
spine both, and through the spine into any pile band that later names the card.

That is why the title a placeholder is *seeded* with matters: get it wrong and
it is wrong for the session, not for a frame. `placeholderTitle`
(`src/lib/card-title.ts`) is the single decision — **manifest, else the clicked
link, and never the uid** (issue #105). The manifest wins because it carries
`resolveCardTitle`'s output, the same function the real fragment renders
through, so it is the one copy guaranteed to agree with what lands; a listing's
link label may be contextual or truncated. A visible
`what/games/digital/numbeanies` reads as a bug to a visitor where an empty
header reads as loading. All three seed sites go through it — the view-transition
push, the browse-stack pre-seed, and `initFromUrl`'s cold-load restore.

**The network is an injected seam.** `createCardFragments({ load })` takes the
fetch, so `card-fragments.test.ts` drives push, close, popstate and
re-activate against a fake fragment source — which is as close to orchestration
coverage as this component gets, since the island cannot be mounted in a test
(see [testing.md](testing.md)). What the module can't cover is asserted against the component's
source instead.

**The cache is not reactive, and that is nobody's call site's problem.** A bare
`Map` write triggers nothing (nor did the old `$state(new Map())` — Svelte does
not deep-proxy Maps); rendering is driven by *store* changes re-reading `get()`.
Anything that must react to a fragment landing subscribes to `onChange`, which
is how the active location's `--max-width` is reapplied after the
placeholder→real swap. Note `applyMaxWidth`'s `typeof document` guard: the
island is server-rendered too, and the SSR seed is a write.

## The active card is slot content, and its DOM must be adopted

`StackNav.astro` hands the SSR-rendered active location to the island as Astro
**slot content** — never as a prop (issue #121). Astro serialises every island
prop into the `props` attribute of `<astro-island>`, so an `activeHtml` string
shipped the whole card **twice**: once as real DOM, once JSON-escaped, the
nested islands' own props included. Measured: 763 KB of a 1.53 MB filtered lens
page, 62 KB of a 255 KB card page. Slot content is emitted as real DOM inside
`<astro-slot>` and never enters `props`, which took the CardStack island's props
from 763 KB to 103 bytes.

**The constraint that rules out the obvious alternative** (spike #120, and it is
why this is a slot rather than a cheaper fix): the active card's DOM must be
hydration-**adopted**, never re-created, because `LensFilterShell` and
`BrowseLensBrowser` are nested `<astro-island>` elements inside it. Svelte 5 does
not adopt an `{@html}` range whose client value differs from the server's — it
discards the whole subtree and rebuilds it, and the nested islands then **never
hydrate**, silently. So "seed the cache from `cardEl.outerHTML` in `onMount`"
cannot work: by then the markup is already gone.

Four things worth knowing:

- **It renders inside the SAME keyed `{#each}`**, as `{@render children?.()}`
  under `{#if entry.slot === ssrSlot}`. One node per entry, keyed by slot,
  is what the whole geometry rests on; the slot content is one entry among the
  rest and differs only in where its markup came from. `ssrSlot` is a plain
  const decided in the same `untrack` block as the store seed, and is identical
  on both sides of hydration — a filtered lens's filters differ between server
  (no query string) and client, but they ride in the **key**, and a first
  allocation's slot is always its uid.
- **`<astro-slot>` is `display: contents`** (Astro ships that rule itself), so
  it generates no box: the active card stays in flow, a collapsed one is still
  absolutely positioned against `.card-stack-inner`, and `data-role`/`data-piled`,
  the five `--geo-*` writes, the pile overlay and the ResizeObserver are all
  untouched. Verified in a browser at both breakpoints, including an 8-card
  fan with a pile.
- **The fragment cache is adopted from the DOM at mount** — `fragments.adopt`,
  which lives in `card-fragments.ts` with every other HTML read. It runs FIRST
  in `onMount`, before `markReadIfKnown`, which keys read state on the content
  hash it finds in the cache. Timing is safe because `astro-island` **defers a
  nested island's hydration until its ancestor fires `astro:hydrate`**: right
  then the islands inside the card still carry their `ssr` attribute and their
  props, and a snapshot taken later would cache inert markup.
- **`initialWidth` is a prop now.** It used to be `extractLocationWidth`d out of
  the string during component init so the right `--max-width` was in the very
  first paint; there is no string at init any more, so the two routes that
  already know the value pass it down (`card.width` / `lens.width` — the very
  values that become `data-width` on the fragment). `applyMaxWidth` falls back
  to it for the SSR slot, because the layout effect's first pass runs *before*
  `onMount` seeds the cache and would otherwise remove the server-rendered
  inline style for a frame — a 960px browse lens snapping to the 680px default
  on every cold load.

## Svelte store is the authoritative card-stack state

The `writable<StackState>` store in `src/stores/card-stack-store.ts` is the single source of truth for which cards are in the stack and which is active. `CardStack.svelte` derives CSS classes (`stack-card--active`, `stack-card--collapsed`) and layout state from the store via `$derived` and applies them via `$effect`. The CSS classes are styling contracts only — never query them in JS to infer state.

**An entry is addressed by `slot`, never by `key`** (issue #106). `StackState`
holds `activeSlot`, and every `findIndex` in the store, the layout and the codec
resolves on `slot`. `key` is what a location *is*, and it does exactly two
things: it is serialised into the URL, and it is what `pushCard` compares to
decide re-activate-vs-push. Keys are **not unique** — clear the filters on a
second view of a lens and it becomes the unfiltered view already sitting behind
it, and **both entries stay**: a stack is the path you walked, a path can pass
the same place twice, and an entry vanishing from the breadcrumb is worse than
two that look alike. Slots are unique by construction (`allocateSlot` /
`withFreeSlot`, and `deserialiseStack` allocates fresh ones per decoded entry),
so the ambiguity is unrepresentable rather than adjudicated — which is why
`rekeyEntry` drops nothing.

The corollary: **a slot is not a uid.** A suffixed handle (`lens/interesting#2`)
addresses a DOM node and a fragment-cache entry, and nothing else. Read state is
keyed by uid, so `markReadIfKnown` takes both — the uid for what was read, the
slot for where its HTML is cached.

**That invariant is about the client, and on the server it is silently false**
(issue #102). The store is module-level and `astro build` prerenders every page
in **one process**, so it is per-visitor state in the browser and
per-*process* state in the prerenderer — page N's stack is still sitting in it
when page N+1 renders. The seed used to write only when it had both an
`activeUid` and the active location's markup, so the home page (which has
neither) inherited the previous page's stack. What that renders is `#card-stack` **without** its
`hidden` attribute, wrapping an empty `.active-card-col` around no card at all —
the card's own markup does not come with it, since the fragment cache is
per-instance. It also made an SSR crash reachable: a `document`-touching applier
ran because the active location was non-null on a page that has no active card.

Today every route that renders the island supplies both (`LensPage.astro`
seeds `lens/<name>`, so even `/` has an active location), so the leak is latent
rather than live in the current build — which is precisely why no visible
symptom was ever found. It becomes live again the moment any page renders
`<StackNav>` without an active location, and nothing about that call site would
signal it.

So **the seed is unconditional and total**: every render states its own initial
stack, and a render with no active location states the empty one. That decision
is `seedStackState` (`card-stack-store.ts`), which returns a **fresh** object
each call — a shared empty constant would let one render's push land in the
next render's "empty". Any future module-level state the island writes at
*render* time (not in `onMount`, not in an `$effect` — neither runs on the
server) needs the same treatment. `CardStack.ssr-isolation.test.ts` guards it by
rendering two pages back to back through `svelte/server`, which is the one
CardStack path a test can exercise directly: `mount()` is unavailable here, but
the same project-wide "ssr" vite environment that forbids it is what makes the
server renderer work.

## Arriving at a card is reading it

Read state (`markRead`, `src/lib/card-view-state.ts`) is recorded on **arrival**,
not only on a client-side push. A cold load of `/card/...` renders the body
open, so arrival and reading are the same act there in a way they aren't for a
stack push — and the visitor who arrives that way (search result, shared link,
RSS, social preview, an old Jekyll URL redirect) never touches a push path at
all. Recording only pushes meant read state accumulated exclusively from people
already browsing in-stack, which silently throttled everything built on it: the
Seen/Unseen lenses, the ranking chain's unseen-before-seen rung, and home slot
rotation (#92).

Exactly one location is marked on mount: the SSR-seeded active one, and only if
it is a card. Two deliberate exclusions —

- **A lens initial location is not a read.** A lens is a listing with no single
  card identity; its fragment carries no `data-content-hash` to key an entry on.
  Same for a collection view (`posts`).
- **`from`/`to` entries restored from a short code are not reads.** They arrive
  *collapsed* — shown but not opened, the same state a front-page slot is in.
  Marking them would claim a visitor read a stack of cards they only saw the
  spine of.

The rule is "a card actually rendered open", and `readToRecord`
(`card-view-state.ts`) is the single decision that encodes it — every
`markRead` call site goes through it. `CardStack.svelte` owns the write, in its
mount path, per the card-stack-mutation invariant above.

## Svelte islands

Interactive components use Svelte 5 (runes syntax) with `client:load`. Key conventions:

- Svelte store files live in `src/stores/` — not `src/lib/`. The `src/lib/` directory is framework-agnostic pure TypeScript.
- `CardStack.svelte` is the only Svelte island currently. New islands follow the same shape: `$state` for local reactive state, `$derived` for computed values, `$effect` for thin DOM side effects that can't be done with template bindings.
- `{@html}` silently drops `<script>` tags in injected HTML strings. Future card renderers must not rely on inline scripts — renderer interactivity must be a Svelte component or a global delegated listener, not an inline `<script>` in the rendered HTML fragment.
- **`{@html}` re-renders when its expression changes**, which is why the stack
  mounts each fragment through `StackFragment.svelte` — a component that reads
  its `html` prop once and never again. The fragment cache's value for a slot
  legitimately changes underneath the template (a card pushed through a View
  Transition mounts from a placeholder, and `replaceBody` then caches the real
  HTML), so a bare `{@html fragments.get(slot)}` destroyed and rebuilt that
  card's node on the next store change. Invisible at rest — same content, same
  position, same `getBoundingClientRect` — and it costs everything the geometry
  is built on, plus every island mounted inside the fragment.

## View Transition names

Never set `view-transition-name` in HTML — it causes conflicts when multiple elements share a name on screen simultaneously. Always:

1. Inject via JS (`element.style.viewTransitionName = '...'`) immediately before `startViewTransition()`
2. Clear after `vt.finished` (`element.style.viewTransitionName = ''`)
3. Use distinct names per direction: `panel-card-open` (link → card) and `panel-card-close` (card → link)

Setting a name on a detached node before appending it inside the `startViewTransition()` callback works correctly — the VT captures the name from the post-callback DOM state.

Clearing is mandatory, not advisory — leaving a name set after the transition will collide with the next one. Instant-fallback paths (when VT is unsupported or skipped) must not depend on the VT to open the body; the `.open` class transition handles that independently.

## `data-uid` format is `collection/id`

It's the round-trip key between DOM and `/card/...` fetches. Don't improvise the format at call sites.

## Layout is reactive, not imperatively called

`CardStack.svelte` derives layout via `$derived(geometryFor($stackStore, …))`. Any store mutation automatically triggers a re-derivation and `$effect` re-run — no explicit layout update call is needed or allowed. Don't add explicit `geometryFor()` calls to event handlers; update the store and let reactivity handle the rest.

