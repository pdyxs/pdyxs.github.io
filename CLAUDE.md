# Dev Server

The Astro dev server runs as a user systemd service called `astro-preview.service`.

To restart it:
```
systemctl --user restart astro-preview.service
```

To check its status/logs:
```
systemctl --user status astro-preview.service --no-pager
```

If you clear the `.astro` cache directory, always restart the service afterwards so Astro can rebuild the content database.

## Content hot-reload (`scripts/dev-reload-plugin.mjs`)

Markdown hot-reloads on its own: the glob loader reloads the entry, and Astro's
dev app responds to the resulting `astro:content-changed` by calling
`pipeline.routeCache.clearAll()`. That route cache is the whole story — it holds
each route's `getStaticPaths()` props, which is where `getAllCards()` /
`resolveCard()` run. Nothing else drops it: not a module invalidation, not a
`vite server.restart()`. Only a full process restart or a content-layer change.

The YAML half of the content tree pulls no such lever. `_config.yaml`,
`<name>.tag.yaml` and `<id>.lens.yaml` are read with node's `fs` (or consumed by
a `pre*` generator), so they are in no module graph and used to need a service
restart to show up. A dev-only Vite plugin now watches them, re-runs whichever
generator the change feeds, and sends `astro:content-changed` itself.

The decision — which generator, whether to refresh — is pure and tested in
`src/lib/dev-reload.ts`; the plugin only watches, debounces, spawns and signals.
It also covers **adding or deleting** a card (a new `index.md` needs a short code
in `src/data/stack-manifest.json`) and `src/icons/lenses/*.svg`. Anything else
that reads a non-module file at request time belongs in `planDevReload`.

Still needs a manual step: `npm run generate:redirects` (reads the retired Jekyll
site on `master`) and `npm run generate:vimeo-posters` (network fetch).

## Architecture

### Theme switching (`data-theme`)

All color switching is driven by the `data-theme` attribute on `<html>`. It is always either `"light"` or `"dark"` in the DOM — the CSS never needs to know about "system". The JS resolves system → actual before setting the attribute.

**Anti-FOUC init pattern:** An inline `<script is:inline>` in `<head>` (in `Base.astro`) synchronously reads `localStorage.getItem('theme')` and `window.matchMedia('(prefers-color-scheme: dark)').matches`, resolves the theme, and sets `document.documentElement.dataset.theme` before first paint. This prevents a flash of the wrong theme.

**Three-state preference:** `localStorage` stores `"light"`, `"dark"`, or is absent/`"system"`. When system, a `matchMedia` change listener keeps `data-theme` in sync as the OS setting changes.

**Rule:** Any new colored surface must use a CSS custom property from `:root` (or the `html[data-theme="dark"]` override block in `global.css`). No hardcoded hex literals or `background: white` outside `:root`.

### Card body expand/collapse

Card bodies use a CSS grid trick for animated expand/collapse. The structure is:

```html
<div class="body-wrapper">        <!-- grid container: 0fr → 1fr -->
  <div class="stack-card-body">   <!-- grid child: overflow hidden, min-height 0 -->
    <div class="stack-card-body-inner">  <!-- carries the padding -->
      <!-- content -->
    </div>
  </div>
</div>
```

- `.body-wrapper`: `display: grid; grid-template-rows: 0fr` — add class `open` to expand (`grid-template-rows: 1fr`)
- `.stack-card-body`: `overflow: hidden; min-height: 0; padding: 0` — padding on the grid child prevents `0fr` from collapsing to zero
- `.stack-card-body-inner`: carries `padding: var(--space-lg)`

This pattern is mandatory for any card renderer that needs animated expand/collapse.

**`open` goes on EVERY card, unconditionally** (issue #109), set by the layout
`$effect` in `CardStack.svelte` — the one exception being a card mid-push
through a View Transition, whose body opens after `vt.finished`. That inverts
what it looks like it should be, and the reason is that the two breakpoints
collapse differently:

- **desktop collapse is a CROP.** A covered card's body stays open and is
  occluded by the spine of the card in front of it. Nothing closes.
- **mobile collapse is a REFLOW**, the original grid trick.

The island cannot tell those apart without `matchMedia`, which the
CSS-first-responsive rule forbids — so it opens everything and the *mobile*
base CSS carries `.stack-card--collapsed .body-wrapper.open { grid-template-rows: 0fr }`,
which the desktop block takes back. There used to be a
`.stack-card--collapsed .stack-card-body { display: none }` beside it; that
removed the very box this transition animates, so mobile collapse snapped for
as long as the rule existed.

### View Transition names

Never set `view-transition-name` in HTML — it causes conflicts when multiple elements share a name on screen simultaneously. Always:

1. Inject via JS (`element.style.viewTransitionName = '...'`) immediately before `startViewTransition()`
2. Clear after `vt.finished` (`element.style.viewTransitionName = ''`)
3. Use distinct names per direction: `panel-card-open` (link → card) and `panel-card-close` (card → link)

Setting a name on a detached node before appending it inside the `startViewTransition()` callback works correctly — the VT captures the name from the post-callback DOM state.

Clearing is mandatory, not advisory — leaving a name set after the transition will collide with the next one. Instant-fallback paths (when VT is unsupported or skipped) must not depend on the VT to open the body; the `.open` class transition handles that independently.

### Svelte islands

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

### Arriving at a card is reading it

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
mount path, per the card-stack-mutation invariant below.

## Invariants

These are load-bearing. Plans and experiments must respect them; violating any of them is a refactor, not a local change.

Global architecture principles (View→Logic one-way, events over direct calls, module independence, pure decisions / thin effects, single source of truth for state) live in `~/.claude/rules/architecture.md`. The project-specific invariants below are how those principles land here, plus constraints unique to this codebase.

### CardStack.svelte owns all card-stack mutations

Any code that pushes, collapses, expands, reorders, or hides cards goes through `src/components/CardStack.svelte`. `src/components/StackNav.astro` is a thin Astro shell that renders `<CardStack client:load />` — it has no `<script>` block. Renderers and other scripts must not reach into `#card-stack` directly. This keeps the VT lifecycle, state, and layout updates in one place.

### `from` and `to` belong to the stack, never to a location

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

### A cold-loaded stack states its shape before it knows its contents

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

### Fragments are HTML; the stack is state (`src/lib/card-fragments.ts`)

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
(see Testing). What the module can't cover is asserted against the component's
source instead.

**The cache is not reactive, and that is nobody's call site's problem.** A bare
`Map` write triggers nothing (nor did the old `$state(new Map())` — Svelte does
not deep-proxy Maps); rendering is driven by *store* changes re-reading `get()`.
Anything that must react to a fragment landing subscribes to `onChange`, which
is how the active location's `--max-width` is reapplied after the
placeholder→real swap. Note `applyMaxWidth`'s `typeof document` guard: the
island is server-rendered too, and the SSR seed is a write.

### Svelte store is the authoritative card-stack state

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
when page N+1 renders. The seed used to write only when both `activeUid` and
`activeHtml` were present, so the home page (which has neither) inherited the
previous page's stack. What that renders is `#card-stack` **without** its
`hidden` attribute, wrapping an empty `.active-card-col` around no card at all —
the card's own markup does not come with it, since the fragment cache is
per-instance. It also made an SSR crash reachable: a `document`-touching applier
ran because the active location was non-null on a page that has no active card.

Today every route that renders the island supplies both props (`LensPage.astro`
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

### One scroll owner, and the peek is doing two jobs

`scrollActiveIntoView(behavior)` in `CardStack.svelte` is the only thing that
scrolls the stack, called from a `$effect` — reactive for the same reason the
layout is: the store is what moved, and a handler that has to *remember* to
scroll is how there came to be four of them. It replaced four
`scrollIntoView({ block: 'nearest' })` sites, and `nearest` was precisely the
wrong primitive: it does nothing when the target is already partly visible,
which in a stack is always.

The rule is `scrollTargetFor(activeCardTop, scrollY, peek)`
(`src/lib/stack-geometry.ts`): the active card's header at the top of the
viewport, **less a peek**. The peek is not cosmetic —

1. it is the **scroll affordance** (flush to the top, the stack above is
   invisible and nothing says it is there), and
2. it keeps the sticky header **unstuck on arrival**. Flush, the 1px
   `.card-header-sentinel` is already off-screen and the header lands
   pre-compacted — a compact header reads as a scrolled state, so arriving in
   one is a lie.

`--stack-scroll-peek` is 28px at mobile (a readable slice of the collapsed
header above) and 24px on desktop (three 8px staircase bands, which is
`backwardStrip * stagger` — the un-piled fan's own reach).

Three things that bite:

- **The effect is keyed on the stack's SHAPE, not on the store.** Active slot
  plus depth. Re-keying a lens when its filters change leaves the visitor
  standing exactly where they were, and yanking the viewport for a filter
  toggle is worse than not scrolling; depth is in the key because
  `initFromUrl` splices `from` entries in *ahead* of the active card, moving it
  down without changing which location is active.
- **A popstate clears that key.** Going back can return the stack to a shape it
  held moments ago while the viewport is somewhere else entirely — the guard
  exists to ignore re-keys, not to ignore history.
- **`history.scrollRestoration = 'manual'` is REQUIRED, and this was measured,
  not assumed.** With `auto`, going back from a pushed card lands at the
  browser's saved offset — 791px *into* the card, header off-screen above —
  because the browser restores at popstate dispatch while the stack is still
  being re-fetched. The stack owns the scroll position; the browser must not
  also own it.

**Cold load and popstate are instant; a navigation is smooth**
(`scrollBehaviourFor`, `src/lib/stack-motion.ts`). A rebuild splices entries in
one fetch at a time and each one needs a correcting scroll — smoothing those is
the page fighting itself, and on first paint it races the browser and loses
visibly.

**The scroll aims only once the layout has stopped moving** (`scrollSettleAction`,
`src/lib/stack-motion.ts`), and this is the crop-vs-reflow asymmetry reaching a
third place — after `.body-wrapper.open` and the geometry applier. On desktop a
collapse is a crop, so the target measured the instant the store moves is
already final. On MOBILE it is a reflow: the outgoing card's body animates to
nothing over 300ms and carries the card being navigated to up the page with it.
Measured once at the start, a push out of a long lens aimed at a 12089px
document and landed in a 2314px one, ~800px past its own header.

So the applier polls in a `requestAnimationFrame` loop and asks three questions,
each covering a hole in the others:

- **Is a `grid-template-rows` transition running in the stack?** The honest
  question, and breakpoint-free without asking about breakpoints — desktop never
  changes that property, so no transition exists there and nothing is waited
  for. Only that property: `left`/`top` run on every desktop navigation and move
  nothing the target depends on.
- **Have at least `SCROLL_SETTLE_MIN_FRAMES` (4) frames been seen?** THE TRAP.
  A class toggle needs a style flush and a frame before the transition it starts
  exists to be observed, so the offset reads *identical on the two frames after
  the card mounts* — a stability test alone reports "settled" at the one moment
  everything is about to move. This was measured, and it is why the first
  attempt at this fix failed.
- **Has the offset stopped changing?** Catches what neither of the others sees:
  a late image, a fragment landing above the active card.

Bounded by `SCROLL_SETTLE_TIMEOUT_MS` (600), because a page whose height never
settles must not leave the scroll unaimed. Two further details:

- **Document offset, never `getBoundingClientRect().top`.** The browser clamps
  `scrollY` as the page shrinks and a smooth scroll is animating it, so a
  viewport-relative reading changes for reasons that are not the layout settling
  and never comes to rest.
- **A missing node waits rather than returning.** The store moves before Svelte
  commits the `{#each}`, so the first frames find nothing. Bailing there is
  silent, and what the visitor gets is wherever the browser's own clamp left
  them.

`settleToken` cancels a loop still running when the next navigation starts —
two loops aiming at different cards would both fire, and the older would land
last.

### Reduced motion reads the computed style, not the preference

`--stack-motion-ms` / `--stack-reveal-ms` / `--stack-stuck-ms` are zeroed in a
`prefers-reduced-motion` block, and `.body-wrapper`'s collapse with them.

That is what makes `transitionWillFire` (`src/lib/stack-motion.ts`) necessary.
**A zero-duration transition starts nothing and fires no `transitionend`**, so
`closeCard`'s wait for the closing card's collapse would sit through its entire
400ms fallback — turning "instant" into a stall, which is the opposite of what
the preference asked for. The guard reads
`getComputedStyle(bw).transitionDuration` rather than asking `matchMedia`,
because the caller's real question is "will an event arrive?", and a duration
can reach zero for reasons that have nothing to do with the preference. Measured
at 143ms under emulated reduced motion, against the ≥400ms it would otherwise be.

The mirror trap: the clip reveal is disabled with `animation: none`, **not** a
zero duration — an animation still paints its final frame at `0s`, and the
reveal's first frame is a full-height clip that would flash.

### Motion is armed one frame late, on purpose

`#card-stack.stack-motion` gates the `left` / `top` / `grid-template-columns`
transitions, and is added by the island two `requestAnimationFrame`s after its
first layout pass. The geometry custom properties are unset until the applier
writes them, so with transitions live from the start every card animates in
from the container's top-left corner on a cold load — a restored stack fanning
out from `0,0` on arrival, which reads as a bug rather than an entrance. Two
frames because one only guarantees the style was *set*, not that a layout ran
against it.

`grid-template-columns` is in the transition list because the spine opening and
closing **is** the collapse; `--left-col` is registered via `@property` so the
track interpolates instead of snapping.

### Stable selector contract

These class names are a CSS/layout contract — renaming any of them is a CardStack.svelte + CSS refactor, not a local change:

- `#card-stack`, `.card-stack-inner`
- `.stack-card`, `.stack-card--active`, `.stack-card--collapsed`, `.stack-card--page`
- `.stack-card-spine`, `.stack-card-spine-inner`, `.stack-card-spine-title`
- `.card-header`, `.card-header-sentinel`, `.card-header--stuck`
- `.stack-card--revealing`, `#card-stack.stack-motion`
- `.body-wrapper`, `.body-wrapper.open`
- `.stack-card-body`, `.stack-card-body-inner`
- `data-role="behind|active|ahead"` and `data-piled` (written by the applier)
- `.stack-pile`, `.stack-pile-inner`, `.stack-pile-label`, `.stack-pile-bands`,
  `.stack-pile-band`, `.stack-pile-band-text` (island-rendered, desktop only)

Deleted with the geometry swap (issue #109), and not to be reintroduced:
`.fan-corner`, `.active-card-col`, `.stack-overflow*`, `data-side`,
`--stack-index`, `--num-left-collapsed`, `--num-right-collapsed`, `--i`, `--n`.

### A pile is the cards, and hovering it splits the slot they share

The overflow representation (issue #111), replacing the deleted `.stack-overflow`
`⋯` strip and its dropdown. **Desktop only** — mobile shows every collapsed
header, so nothing is hidden there and there is nothing to stand in for.

At rest a pile is already drawn: `computeGeometry` places every piled card in
one slot, staggered, capped at `MAX_PILE_LAYERS` (3) drawn edges because past
three a pile stops adding information and a pile of 40 is still a small pile.
The `.stack-pile` overlay adds only what the cards cannot say for themselves —
how many are hidden, and a way to reach any one of them.

**It is island-rendered, not fragment markup.** A fragment is a location
rendered on its own; "how many cards are hidden behind me" is the most
stack-positional fact there is, and putting it in the shell would make fragments
know where they sit.

**The overlay is drawn on the LABEL card's placement**, which `geometryFor`
hands over (`PlacedPile.left/top/z/dither`) rather than the applier recomputing
— so it can never drift off the edge it labels. It is inset by one border so it
covers exactly that card's spine *track*: the card's own frame still draws the
pile's edges, the label lines up with the spine titles either side of it, and
the box stops exactly where the next card begins. **The ahead side redraws its
own right border**, for the same reason ahead cards need `clip-path` at all —
nothing in front closes that edge, and the overlay paints over the `::after`
the card was using.

**Two caps, and they are different numbers.** `MAX_PILE_LAYERS` (3) is what a
pile *draws* at rest; `MAX_PILE_BANDS` (12) is what it *offers* on hover. Both
obey the same rule — the last one absorbs the remainder — so **a band never
stands for exactly one card it isn't showing**, and "1 more" is unrepresentable
rather than avoided.

**Bands run the way the stagger does.** A behind pile staggers upward as it
deepens, so its deepest card is the TOP band ("the way back is up and left");
ahead mirrors it. `pile.indices` is nearest→deepest for both sides, so
`geometryFor` reverses only behind and returns `bands` in visual top-to-bottom
order.

Three things that bite:

- **The label and the bands are BOTH always rendered**, and both stay in the tab
  order; hover and `:focus-within` only swap which is painted. Bands behind
  `display: none` could not be focused, and focus is the only way a keyboard
  reaches a card buried in a pile.
- **A hovered band is an INVERTED surface** and needs the mirror of every
  flat-surface rule, not just swapped colours. The `-webkit-text-stroke` is
  always the *surface's own* colour — paper stroke on paper, ink on ink — which
  is what keeps it invisible until a dither shows through. Left paper on an
  inverted band it fattens the glyphs instead of clearing dots behind them. See
  the `--color-selected-*` section.
- **The overlay is keyed by SIDE, not by label slot.** There is at most one pile
  per side and its label card changes on every push; keyed by slot the overlay
  would be destroyed and rebuilt each time, mounting at its destination instead
  of travelling there — the same identity trap the cards have. Its own `left`
  turns out to be stable while it exists (`behindPileSlot` is always
  `backwardStrip` when there is a pile at all), so what you normally see change
  is the count, not the position.

`--stack-height` — the measured `.card-stack-inner` box, written by the same
ResizeObserver that measures `activeWidth` — caps the sticky label so a stack
shorter than the viewport doesn't get a 100vh child forcing its own height. It
is guarded on a real measurement: at mobile `.card-stack-inner` is
`display: contents` and measures zero.

### Card resolution happens once, in `resolveCard()`

`resolveCard(entry, cascade, ctx)` (`src/lib/cards.ts`) is the only place a card's
title, description, tags, renderer, nav renderer, status, visibility and content
hash are decided. It is pure and synchronous — the cascade is read by the caller,
and `isDev`/`now` arrive in `ctx` — so the whole sequence is unit-testable without
Astro. `getAllCards()` is the thin IO shell around it.

Consumers take the result; they never re-derive it. `CardStackCard.astro`
receives a `ResolvedCard` prop from its route's `getStaticPaths()` (which already
calls `getAllCards()`) and resolves nothing itself — enforced by a guard in
`CardStackCard.test.ts` that fails if the component references any resolution
primitive. The content hash in particular must be byte-identical to the pool's,
or client-side read tracking (`getViewState`, keyed on the hash) treats every
visit as changed content.

Two types, deliberately split:

- **`CardMeta`** — the listing subset every card has, including ones with no
  entry behind them (`collapse.ts` synthesises one per collapsed folder). This
  is what sitemap, RSS, front-page slots and the browse pool consume.
- **`ResolvedCard = CardMeta & { navRenderer?, titleSuffix?, width? }`** — adds
  the fields only a full card render needs. Kept off `CardMeta` because
  `CardMeta` crosses the wire to the browse client, where none of them mean
  anything.

To give the single-card view a new field, extend `ResolvedCard` — never resolve
it locally in the component.

### The client payload is an explicit pick, never a spread

`LensStackCard.astro` builds each `SerialisedCardFull` by listing its fields.
Spreading the card instead skips excess-property checking, so build-time-only
fields ship to the browser silently and every field later added to `CardMeta`
joins them. What crosses the wire is a decision.

### `data-uid` format is `collection/id`

It's the round-trip key between DOM and `/card/...` fetches. Don't improvise the format at call sites.

### Layout is reactive, not imperatively called

`CardStack.svelte` derives layout via `$derived(geometryFor($stackStore, …))`. Any store mutation automatically triggers a re-derivation and `$effect` re-run — no explicit layout update call is needed or allowed. Don't add explicit `geometryFor()` calls to event handlers; update the store and let reactivity handle the rest.

### One in-flow card, N absolutely-positioned siblings

The desktop stack used to be **three layout systems glued together** —
absolutely-positioned left strips, an in-flow flex `.active-card-col`, in-flow
right strips, plus `.fan-corner` L-connectors and `.stack-overflow` panels
standing in for the hidden cards. All three are gone (issue #109), replaced by
one pure function.

Every entry renders one `.stack-card`, all of them siblings inside
`.card-stack-inner`, in `entries` order and keyed by `slot`. The **active card
is the only in-flow node** — it gives the container its height — and every other
card is `position: absolute`, placed by `computeGeometry`
(`src/lib/stack-geometry.ts`). **Painting order does the occlusion**: a behind
card is cropped for free by the card in front of it, so nothing has to crop it.

The applier writes five properties per card — `--geo-left`, `--geo-top`,
`--geo-z`, `--geo-extra-height`, `--card-surface` (plus `--card-surface-hover`,
the same level stepped up two) — and `data-role` / `data-piled`. It toggles
`--active` / `--collapsed` / `--page` exactly as before; **page mode is
untouched**, look and mechanism both (#98 ruling 2).

**There is no `matchMedia` and there must never be.** The applier writes all of
it at both breakpoints and the CSS decides what to consume: desktop reads
everything, mobile reads only `--card-surface` and stays in flow. So "mobile
shows every collapsed header" is what *falls out* — the geometry places every
card, and piling changes only `left`/`top`/`z`, which mobile ignores.

Four things that bite:

- **Every card wears the ACTIVE card's width.** `--stack-card-width` is
  `min(var(--max-width), 100vw - (behind + ahead slots) * var(--spine-width))`,
  and `--behind-slots` / `--ahead-slots` come from the same geometry that placed
  the cards (`slotsUsed`) so the reservation can never disagree with what is
  drawn. The consequence: re-activating a 960px lens from behind a 520px puzzle
  card animates every card's width.
- **`activeWidth` is measured, not re-derived.** The ahead fan is placed off the
  active card's width, and that width is a CSS `min()` — so a ResizeObserver on
  `.card-stack-inner` reads it back rather than JS owning a second copy of the
  formula. No feedback loop: the slot counts the width is computed from depend
  only on stack length and active index.
- **The ahead side is not a mirror.** A behind card is cropped for free; an
  ahead card has nothing in front of it, so its crop must be asked for —
  `clip-path: inset(0 calc(100% - var(--spine-width)) 0 0)`, plus an `::after`
  right border at `calc(var(--spine-width) - var(--border-width) * 2)`. The
  `* 2` is load-bearing: an absolutely positioned child is offset from the
  **padding** box while `clip-path` measures from the **border** box, so one
  border-width out lands it past the clip and it vanishes. `clip-path` is safe
  where `transform` is not — it creates no containing block for the fixed
  dither.
- **The geometry places EVERY card, piled ones included.** A card left out is a
  DOM node that gets destroyed and rebuilt, so it mounts at its destination
  instead of travelling there and nothing animates. Same failure mode as the
  `{@html}` trap above. Both are invisible at rest and invisible to
  `getBoundingClientRect` — which is why this is verified **in motion and by
  identity**, never from a screenshot (four separate times in #98 a still image
  was correct while the behaviour was broken). The automated half is
  `CardStack.island.test.ts` asserting the same element references survive an
  active-index change.

## Conventions

### All semantic colors and spacing go through CSS custom properties

No hex literals or raw pixel values outside `:root` for anything that represents a design token (colors, spacing, radii, breakpoints). Dark-mode support and future theming depend on this.

The palette is **two colours**: ink (`--color-text`) and paper (`--color-bg`), pure black and pure white, swapped by `data-theme`. Everything greyscale derives from those two — `--color-surface`, `--color-border-light` and `--color-text-muted` are aliases, and every other tone is a `--dither-N` level built from the same two colours. There is no grey. De-emphasis is expressed by size and weight, never by a faded value; **an `opacity` used to soften a colour is a bug**, because it renders as the grey the palette doesn't have.

### The dither is one fixed, viewport-anchored grid — never give it a transformed ancestor

Every `--dither-N` is a stack of `radial-gradient(circle at 0.5px 0.5px, … 0.564px, #0000 0.584px) 0 0/4px 4px **fixed**` layers — sub-pixel dots in 1px cells. `gen-dither.mjs` picked `TILE = 4` so those cells land on the device pixel grid (`// 4px/4 = 1px cells, pixel-aligned`), and `fixed` anchors the grid to the **viewport** rather than to each element's own box.

That makes the dither a single global dot screen; a dithered element just clips its window onto it. Elements can therefore scroll, animate, resize or slide freely — the pattern never moves, so it is never re-rasterised at a new sub-pixel phase. (Element-anchored, it was: any movement made the 0.564px dots land differently on the pixel grid every frame and the surface visibly shimmered.)

**`fixed` must stay inside the token.** Consumers write `background: var(--dither-N)`, and the `background` shorthand *resets* `background-attachment` — a separate longhand would have to follow the shorthand at all ~49 call sites and would be forgotten. Add it in `dot()` in `gen-dither.mjs`, nowhere else.

**The trap:** a `transform`, `filter`, `backdrop-filter`, `will-change: transform`, `contain: paint` or `perspective` on any **ancestor** of a dithered element creates a containing block for fixed backgrounds. The grid silently re-anchors to that ancestor and the shimmer comes back, with no error and no obvious cause. Before adding any of those to a container (a drag interaction, a parallax, a compositing hint), check whether anything inside it carries a dither.

Two consequences worth knowing:

- **All levels share one grid**, so adjacent surfaces at different levels line up dot-for-dot.
- **View Transitions** are unaffected either way: they snapshot the element to a bitmap and transform *that*, so a dithered header scales as an image. It can look soft mid-morph; it does not shimmer.

`background-attachment: fixed` is a known scroll-performance cost (the background repaints rather than being translated by the compositor) and is unreliable on iOS Safari, where it may degrade to `scroll`. Treat the no-shimmer guarantee as solid on desktop and best-effort on iOS.

### Code blocks are monochrome, and an untagged fence wraps

`markdown.syntaxHighlight` is `false` in `astro.config.mjs`. Shiki's themes hardcode hex (the default `github-dark` painted every block `#24292e` in *both* themes), and a two-colour palette has nowhere to put syntax hues. Astro therefore emits bare `<pre><code>` and `global.css` owns the surface: ink on `--dither-2`, with the `.dither-text` paper stroke so the dots don't read through the mono glyphs.

The language tag is the wrap switch. A tagged fence keeps `overflow-x: auto` — wrapping real code makes its line breaks ambiguous. An **untagged** fence is almost always prose someone reached for a code block to quote, so `pre > code:not([class])` gets `white-space: pre-wrap` plus a `-2ch` hanging indent. Turning `syntaxHighlight` back on would break that selector, since Shiki always emits a class.

### Selected states use the `--color-selected-*` tokens

A selected control is the page inverted — it sits at the ink end of the dither ramp, so it needs the *mirror* of every flat-surface rule, not just swapped text and background:

| | rest | hover |
|---|---|---|
| flat surface | `L0` (paper) | `--color-bg-hover` (`L2`) |
| selected surface | `--color-selected-bg` (`L16`, ink) | `--color-selected-bg-hover` (`L14`) |

`--dither-14` is paper dots on ink, so the hover delta is identical in both directions. Three tokens cover it: `--color-selected-bg` (fill, border, **and text-stroke**), `--color-selected-fg` (text, counts, glyphs, internal dividers), `--color-selected-bg-hover`.

The stroke is the trap. `-webkit-text-stroke` is inherited and paper-coloured by default (see the `.dither-text` block in `global.css`), which is correct on a flat surface and *wrong* on an inverted one: paper stroke behind paper glyphs fattens them instead of clearing dots behind them. Any selected rule whose element inherits the stroke must restate `-webkit-text-stroke-color: var(--color-selected-bg)`.

These are applied as per-component rules rather than one shared class because Svelte's scoping inflates selector specificity — a global `.is-selected` loses to a component's own scoped base rule. The tokens are the contract; the rules live with the component.

### One description, one visibility predicate

Two discovery rules live in exactly one place each:

- **`resolveDescription` (`src/lib/description.ts`)** decides a card's one-line summary — hand-written `description` first, else a markdown-stripped, word-boundary-truncated body excerpt. `resolveCard()` runs it once and stores the result on `CardMeta.description`; OG/Twitter meta, JSON-LD, RSS and browse-card subtitles all read that field. Don't re-derive a summary at a call site.
- **`visibility.listed`** decides what is publicly advertised. `buildFeedItems` (`src/lib/rss.ts`) and `buildSitemapEntries` (`src/lib/sitemap.ts`) both filter on it; `src/lib/sitemap.test.ts` asserts they agree card-for-card against the shared fixtures in `src/test/card-fixtures.ts`. This is why `/sitemap.xml` is a hand-rolled route rather than `@astrojs/sitemap` — page enumeration would advertise `unlisted` cards, which are reachable by design.

Share metadata itself (canonical URL, OG/Twitter tag list, JSON-LD documents) is decided by pure functions in `src/lib/seo.ts`; `Base.astro` is the thin applier that emits them. `og:image` falls back to `DEFAULT_OG_IMAGE` (`public/og-default.png`, 1200×630) whenever a card has no usable header image.

### Content-relative paths resolve from the working directory, not the module

Anything that reads `src/content` at request time goes through
`assertContentRoot()` / `CONTENT_ROOT` (`src/lib/content-root.ts`) — never
`fileURLToPath(import.meta.url)`. The module's own location is not the project's:
`astro build` bundles these modules into the prerender output, where
`../content` resolves to `dist/.prerender/content`, which has never existed.
Both `_config.yaml` readers caught the ENOENT and returned null, so the whole
folder cascade silently yielded nothing in production while `astro dev` (running
from source) looked correct — issue #88, live for the entire life of the
cascade. `process.cwd()` is stable across all three contexts these modules run
in (`astro dev`, `astro build`, plain Node for `scripts/*.mjs` and vitest); an
Astro virtual module would only have fixed the middle one.

The second half of the rule is that it must fail *loudly*. A per-file
"no such file" is the normal case and has to stay cheap, which is exactly what
made a broken root indistinguishable from an empty tree. So the distinction is
drawn once, at reader construction: `assertContentRoot()` throws if the root is
missing or contains zero `_config.yaml` files. `src/lib/content-root.test.ts`
covers the real resolution and guards both readers' source against
`import.meta.url` coming back.

### Renderer registration is mandatory

Any new content collection must set its default renderer via `_config.yaml` in its content directory (resolved by `resolveFolderCascade` in `src/lib/folder-config.ts`, which walks every ancestor `_config.yaml` from the dimension root down — nearest wins); any new renderer component must be registered in `COLLECTION_RENDERERS` (`src/lib/renderers.ts`). Renderers must early-exit on missing `entry` and treat `Content` as optional — follow `GenericRenderer`'s shape.

Panel sections (`group:` on a container `_config.yaml`, ordered by the dimension
root's `groupOrder`) apply at **every** drill level, not just the root: drilling
into Puzzles shows the three `group: Series` folders, then a divider, then the
generated difficulty ratings. A level whose nodes are all ungrouped collapses to
one section and renders as a flat list, which is every other level on the site.

`width` and `gallery` cascade the same way (`_config.yaml` → `FolderCascade` → `ResolvedCard`, with a card's own frontmatter winning). Cards in a folder usually share a shape, and the shape is what sets the width: `what/puzzles` declares `520px` because a puzzle card *is* its square grid image, and at the site's 680px default that image dominates the viewport. Declare both per-folder, not per-card.

The applier is `applyMaxWidth` in `CardStack.svelte`, and it writes `--max-width` to **both** `<html>` and `#card-stack`. That is not redundant: the server renders `#card-stack` with the initial location's width inline so the first paint is right before hydration, and an inline style on `#card-stack` beats an inherited value from `<html>` for everything inside it. Writing only to `<html>` left a card pushed on top of a wide lens (browse is 960px) wearing the lens's width forever.

### `priority` is additive — and it is the only cascading key that is

Every other cascading key (`renderer`, `navRenderer`, `status`, `width`,
`gallery`, `dateLabel`, `sort`) is **nearest-wins**: the deepest declaration
replaces the ones above it. `priority` is the exception — a card's priority is
the **SUM** of every declaration that applies to it:

- its own frontmatter `priority`
- **every** ancestor folder's `_config.yaml` `priority` (not just the nearest)
- the `priority` on every `<value>.tag.yaml` for a tag it carries

Negatives push a card down. Nothing about the word "priority" signals any of
this, which is why it is stated here, at the top of `src/lib/priority.ts`, and
in the schema comment in `src/content.config.ts` — three places, deliberately.
The magnitude convention (hundreds to move a folder as a block, ones to sort
within it) is the author's; the code enforces no scale.

**A folder counts once, as an ancestor** — never a second time as a filter
value. A card in `what/puzzles` carries `what:puzzles` as its path tag, so
without that rule a folder that both cascades a priority and declares one as a
tag would double it, and tuning becomes unpredictable exactly where you are
trying to tune. `tagPrioritySum` skips any tag naming one of the card's own
ancestors.

The decision is pure (`src/lib/priority.ts`); `resolveCard()` calls it and
stores one integer on `CardMeta.priority`. Affiliation tags land *after*
resolution (they are a fixed point over the whole pool), so `getAllCards()`
tops the sum up with whatever those tags declare rather than recomputing it.

Container `_config.yaml` priorities deliberately do **not** enter the
`.tag.yaml` priority map (`discoverTagPriorities`) — that is the same
counted-once rule, enforced at the source.

`imagePad`'s hazard applies here too: zod *strips* unknown frontmatter keys, so
`priorty: 100` would be silently ignored. `src/lib/priority-frontmatter.test.ts`
scans the raw markdown for near-misses and fails, because by the time content
reaches the audit lens the offending key is already gone.

### The ranking comparator is a chain, not a score

`compareCards` (`src/lib/ranking.ts`) is what "Most\* Interesting" sorts by. Six
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

### One seen concept, keyed two ways

`src/lib/card-view-state.ts` records exactly one thing: **did the visitor open
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

### Home slots are the ranking chain, day-seeded

A home filter slot is **the top `pool` cards its filter leaves, with the calendar
day picking between them** (`selectSlotCard`, `src/lib/slot-selection.ts`). The
ordering is `rankCards` — the site's one comparator, not a second selection rule
— so authored `priority` decides what is eligible and the day decides which of
those you get. `pool` is declared per slot in `src/content/what/home.lens.yaml`;
`DEFAULT_SLOT_POOL` (5) when absent.

### A folder's `sort` is a key *and* a direction

`sort: difficulty asc` in a `_config.yaml`, cascading nearest-wins like
`renderer`. Keys: `date`, `difficulty`, `order`, `title`; a bare key takes its
natural direction (`date` desc, the rest asc); the default is `date desc`;
**missing values sort last in both directions** — an unrated puzzle is not
"difficulty zero", and flipping the direction must not promote every card that
failed to say.

`resolveSortValue` resolves the folder's key into one comparable primitive at
build (`CardMeta.sort.value`), so the comparator never has to know what
`difficulty` means and the client payload carries one field instead of four.
`difficulty` is read by `parseDifficultyLevel` — this is that function's fourth
consumer, not a second parse. `what/puzzles` declares `difficulty asc`: a solver
picking a puzzle is choosing a difficulty, and its publication date says nothing.

### Nav renderer pattern (`NAV_RENDERERS`)

Collections that need custom navigation (e.g. prev/next chapter buttons, position indicators) register a nav renderer in `NAV_RENDERERS` (`src/lib/renderers.ts`). A nav renderer owns the full card shell — header and body structure — and receives the content renderer as `<slot />`. It is responsible for rendering `<CardHeader>` (or a custom header), the `.body-wrapper` / `.stack-card-body` structure, and any footer nav. Props passed by `card/[...path].astro`: `title`, `titleSuffix`, `entry`, `allEntries`.

A nav renderer is usually declared by the folder (`navRenderer: series` in a
`_config.yaml`), but `getSeriesSiblings` matches on the `series:` frontmatter
value alone — so a *subset* of a folder could be its own ordered run by
declaring `navRenderer`/`series`/`order` in frontmatter instead. Keep `series:`
values globally unique; they are matched across the whole collection, not
within a folder.

A series shows its whole run as a `CardStrip` — the same component as the
"Cards about this" section — rather than prev/next buttons. Two buttons can only
say what is immediately adjacent, which is the least interesting thing about a
series; the strip shows the run, where you are in it, and lets you jump
anywhere. The open card is in the strip, passed as `currentUid`: `BrowseCard`
renders it as a marked, non-navigating tile (`current`) and the strip opens
scrolled to it.

**The strip is not rendered by `SeriesNavRenderer`.** A nav renderer wraps the
content renderer as a slot, so anything it appends lands *below* the content
renderer's own "This is about" / "Cards about this" strips — three sections of
the same kind, with the most relevant one last. So `CardStackCard` resolves the
previews (`resolveSeriesCards`, `src/lib/series-cards.ts` — the IO shell around
the pure `getSeriesSiblings`) and passes them to the content renderer as
`seriesCards`; `GenericRenderer` renders "In this series" ahead of the other
two. The trigger is the card's `series:` frontmatter alone, not the nav renderer,
which is what lets a frontmatter-declared run get the strip. `SeriesNavRenderer`
is left owning just the header's `current/total` indicator.

Two traps that cost a round each:

- **The current tile is an inverted surface**, so it needs the mirror of *every*
  muted rule in `BrowseCard`, not just background and title. `--color-text-muted`
  is an alias of the ink — left alone, the date, the summary and the tag chips
  are ink on ink and simply vanish.
- **Open-on-current runs one frame late**, and re-measures first. The geometry
  it centres on is read from layout; measured in the same tick as mount, the
  flex children have no widths, the strip doesn't overflow, and the clamp in
  `scrollLeftForCard` correctly resolves that to "don't scroll". It also runs
  exactly once — a later resize must not yank the strip back after the reader
  has scrolled away.

### A capped lens browses as a strip, and the cap is what makes it work

Newest and Oldest are timelines, not grids: `display: strip` plus `limit: 30`
in the lens `config` (`src/content/when/*.lens.yaml`), decided by `isStripLens`
(`src/lib/strip-lens.ts`) and applied by `BrowseResults`'s `layout` prop, which
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

### The history lenses partition the pool on `uid` alone

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
**reason**, by `historyEmptyMessage` (`src/lib/history-lens.ts`), with
`anyHistory` / `anyUnread` read from the **unfiltered** pool: "you haven't
opened anything yet" and "you have read everything" are claims about the site,
and a filter excluding your history is a different thing entirely. `BrowseResults`
takes the result as `emptyMessage` (defaulting to the filter wording).

One thing worth knowing about the cutover: a returning visitor does **not** see
an empty Seen lens. Pre-#83 entries are reads with no `readAt`, and `hasBeenRead`
counts them — they show up, sorted last by `compareReadAt`, which is exactly the
graceful degradation #68 asked for. Membership is `hasBeenRead`, never
`getReadAt() !== null`; the latter would silently delete history on day one.

### Collection view renderer pattern (`COLLECTION_VIEW_RENDERERS`)

Collection views are browsing cards for an entire collection — e.g. `/card/posts` lists all posts with tag filter chips. They use bare collection-name UIDs (`posts`, `projects`) with no id component, which is a deliberate exception to the `collection/id` invariant. Register them in `COLLECTION_VIEW_RENDERERS` (`src/lib/renderers.ts`). The renderer is a plain Astro component that fetches all cards server-side and passes them to `<CollectionBrowser client:load />`. To link to a collection view from card content, use `[text](collection:posts)` — `CardStack.onDocumentClick` handles the `collection:` protocol and pushes `/card/posts`.

### The default browse lens is Most\* Interesting, and it is uncapped

`DEFAULT_BROWSE_LENS_ID` (`src/lib/lens-registry.ts`) is **`interesting`**, not
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
  delegates to `rankCards` (`src/lib/ranking.ts`) — the same comparator the home
  page's day-seeded slots and the Unseen lens use. Don't write a second ordering.
- **`note:`** is a lens-level footnote (*"\*an attempt at that, anyway"*),
  rendered by `deriveLensChrome` beside the title in both chrome modes and
  hidden on a collapsed card. It is kept a **separate string from the title**:
  `CardStack` reads `.card-header-title`'s `textContent` as a placeholder card's
  name and would otherwise name the card after its own disclaimer.

**The chain has two runtime rungs, so the browser's order differs from the
server's.** Filter-match count and seen-ness are only knowable client-side, so
the static build renders rungs 2/4/5/6 and `BrowseLensBrowser` re-sorts on
hydration. Unguarded that is a whole grid visibly reshuffling a beat after it
paints, which reads as a bug — so `Base.astro`'s inline anti-FOUC script sets
`data-filters-pending` for a `/lens/` path when localStorage holds **any**
`pdyxs:view-state:` key, and the browser clears it once the re-sorted DOM is
committed. Deliberately conditional on there *being* a read history: a
first-time visitor's re-sort is a no-op, so they pay nothing. The seen set is
snapshotted once in `onMount`, never read live — a list reshuffling because you
opened a card elsewhere in the stack is worse than being one navigation stale.

### Progressive reveal appends; it never windows

`BrowseResults` renders a leading slice of a **grid** and asks for the next step
from an `IntersectionObserver` sentinel with a deliberately generous
`REVEAL_ROOT_MARGIN`, so the reader never arrives at an end. Decisions are pure
in `src/lib/progressive-reveal.ts`; the observer and the fallback button are the
thin applier. On by default for every grid lens (`revealSettings()` — a lens
opts out with `reveal: false` or resizes the step with `reveal: <n>`); a short
result set costs nothing, since with nothing held back neither the sentinel nor
the button renders.

Four things that bite:

- **Never virtualise.** Removing DOM nodes on scroll invites `contain: paint` or
  `will-change: transform` on the scroll container, and per the dither section
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

### Internal links in card content use a protocol, never an absolute URL

Body content links to the rest of the site through one of three protocols, all handled by `onDocumentClick` in `CardStack.svelte`. Each stays inside the card stack — an ordinary `https://pdyxs.wtf/...` or `/card/...` href is a full page load that discards the stack, and is treated as a data bug (guarded by `src/lib/content-links.test.ts`).

| protocol | pushes | example |
|---|---|---|
| `card:<uid>` | that single card | `[Numbeanies](card:what/games/digital/numbeanies)` |
| `collection:<dim>:<value>` | browse lens pre-filtered to that tag | `[Projects](collection:what:projects)` |
| `tag:<value>` | browse lens filtered to a tag value | `[Svalbard](tag:where:europe/norway/svalbard)` |

`<uid>` is the full dimension-rooted content path (`what/games/digital/numbeanies`), the same string as `data-uid`. Use `card:` for a single entry and `collection:` for a folder/series — a series folder has no card of its own, so `collection:what:posts/stories/arctic` is the only way to reach it.

### Video embeds are a bare link on its own line

YouTube and Vimeo embeds are never raw `<iframe>` — that's Jekyll-era markup the
audit lens flags as `legacy-markup`. Put the URL alone in its own paragraph and
`rehypeVideoEmbeds` (`src/lib/video-embeds.ts`) turns it into a responsive
`figure.video-embed`:

```
https://www.youtube.com/watch?v=u0nnn_4ZKGs
```

Only a paragraph containing *nothing but* the autolinked URL is rewritten, so a
video referenced mid-sentence, or a link with its own label, stays an ordinary
external link. `parseEmbedUrl` (`src/lib/embeds.ts`) is the single decision
point for what counts as an embed and accepts every shape the migrated content
carries (`/embed/<id>`, `watch?v=`, `youtu.be/`, `vimeo.com/<id>`,
`player.vimeo.com/video/<id>`).

The same parser handles embed URLs left in the legacy `images[]` frontmatter:
`resolveGalleryImages` resolves them to `kind: 'embed'` and `ImageGallery`
renders them as a **facade** — provider poster plus a play badge, with the
iframe only mounted once the lightbox opens, so no third-party player script
loads for a card nobody clicks.

Posters are asymmetric. YouTube has a predictable path (`i.ytimg.com/vi/<id>/mqdefault.jpg`
— `mqdefault`, since `hqdefault` letterboxes 16:9 into 4:3). Vimeo has none, so
`scripts/generate-vimeo-posters.mjs` resolves them via oEmbed into
`src/data/vimeo-posters.generated.ts` at predev/prebuild. That fetch is
incremental — an id already in the committed map is never re-fetched, so offline
builds are a no-op — and an unresolved id is reported in the generated file's
header and renders a labelled tile rather than a broken image.

New CSS contract: `.video-embed` (global.css). New tokens: none.

### A gallery never repeats what the body already shows

With no `images:` frontmatter, `resolveGalleryImages` (`src/lib/images.ts`)
sweeps the card's own folder — so a card whose prose walks through a worked
example image by image (the puzzle "Plans of a Medic") would show every one of
those images a second time as a gallery strip. The sweep therefore skips any
colocated file the body already links by name. An explicit `images[]` is never
filtered this way: naming a file there is a deliberate request to gallery it.

A folder can drop the strip entirely with `gallery: false` in its
`_config.yaml` (cascading nearest-wins like `renderer`, overridable per card in
frontmatter). `what/puzzles` does: a puzzle card *is* its grid image, which is
already the masthead, so the gallery had nothing to add.

### Header-image padding is authored, and the original is kept

Some source images are cropped flush to their content — every logic-masters
puzzle export sits at a 0–1% margin — and the full-bleed masthead then butts
that content against the card border. Whether that reads as damage or as a
deliberate frame depends on *what* is at the edge: Cityscrapers has unknown-clue
boxes outside the grid and looks clipped; a plain fog grid at the identical crop
looks intentional. No bounding-box heuristic separates those, so the amount is
authored per card and `npm run pad:images` applies it:

```yaml
image: bild.png
imagePad: 5%      # or 40px; a percentage resolves against the longer side
```

**The unpadded source is preserved at `<card>/_original/<file>` and every run
re-pads from it.** That is what makes the value adjustable: changing 5% to 8% is
a fresh pad of the original, never 8% added on top of 5%. Removing `imagePad`
(or setting it to `0`) restores the original — so backing a change out can't
strand a padded file with nothing in the frontmatter to explain it. An explicit
`0` is worth writing rather than deleting the key: it records "I looked at this
one and it needs nothing".

Decisions are pure in `src/lib/image-padding.ts`; `scripts/pad-card-images.mjs`
is the fs + sharp shell. The border colour is sampled from the original's own
four corners (`chooseBackground`), not hardcoded white — a dark or transparent
source would otherwise get a white frame that reads as damage.

Three things that bite:

- **It is deliberately not a `predev`/`prebuild` step.** Its output is committed
  image files and it only needs running when a value changes; wired into every
  dev boot it would rewrite assets on a machine that never touched them. Run it
  by hand, `--check` to preview.
- **Nothing reads `imagePad` at runtime.** It is in the schema for
  discoverability and Obsidian's Properties pane only. Zod *strips* unknown
  frontmatter keys rather than rejecting them, so a typo (`imagePadding:`) is
  silent — the script's run summary ("18 untouched") is the only signal, which
  is why it prints one.
- **`_original/` is under the card directory**, so every `startsWith(prefix)`
  sweep in `images.ts` would pick the unpadded source up and gallery it as a
  second, subtly different thumbnail. `isCardOwnAsset` (reusing
  `isVaultInfrastructurePath`) excludes it from both the gallery sweep and the
  audit lens's `localAssetFilenames`. Any new sweep over a card's colocated
  files must do the same.

`imagePad` is declared in the schema's `── puzzles ──` section although it works
on any card — the section is what keeps it out of every other folder's Templater
scaffold, and puzzles are the only folder that routinely needs it.

### One lightbox, two ways in

`Lightbox.svelte` is the full-screen viewer — overlay, keyboard map, prev/next
wrap — and nothing else. Two callers decide what the set is:

- **`ImageGallery.svelte`** — the thumbnail strip, opening the gallery set.
- **`InlineImageViewer.svelte`** — the images a card's *body* renders inline.
  It has no UI at all: a delegated click listener plus a `<Lightbox>`. The set
  is every inline image in the card, in document order, so prev/next steps
  through a worked example rather than dead-ending on the one you clicked.

The listener binds to the enclosing `.stack-card-body-inner`, never `document`,
so a click in one card of the stack can't open another card's viewer.
`GenericRenderer` mounts the island only when `bodyHasInlineImage(entry.body)`
— most cards have none, and an island that can never fire is a download for
nothing.

Which images those are is one decision, `INLINE_BODY_IMAGE_SELECTOR`
(`src/lib/inline-images.ts`): `:is(p, li) > img`, since Astro's markdown wraps a
lone image in a paragraph. `global.css` writes the same selector out by hand
(CSS can't import it) to cap the height at `--inline-image-max-height` and set
the zoom cursor. **Change one, change both.**

The cap is `max-height` plus `object-fit: contain` — never `width: auto`. Astro
markdown images are `loading="lazy"` and carry width/height attributes, and
those attributes are what reserves the box before the file arrives; `width:
auto` discards them, an unloaded image has no intrinsic width, and the box
collapses to zero — so the image never intersects the viewport, never loads, and
the page jumps as each one finally pops in.

The header image is the exception to the no-repeats rule above — it always leads
the gallery, because the lightbox is the only way to see it full size.

### Card credits (`meta:`) are one flat shape, for Metadata Menu

A card's credit/fact rows ("Medium", "Technology", "Accolades", "Made with") are
an open-ended list, ported from the Jekyll site's `definitions:` — 22 distinct
labels across 25 cards, most used once, which is why they are a list and not
named schema fields.

The authored shape is **uniform and unconditional**, because `src/content` is an
Obsidian vault and this field is meant to be edited through a Metadata Menu
fileClass:

```
meta     Object List
├ label  Input
└ values Multi
```

Metadata Menu declares **one static shape per Object List item**. So two things
are banned in this schema, and both were tried and reverted:

- **No unions in `values`.** It is always `string[]`. A link is written as an
  ordinary markdown link inside the string —
  `"[Libby Heaney](http://libbyheaney.co.uk/)"` — which is the native Obsidian
  idiom. `parseMetaItem` (`src/lib/card-meta.ts`) unwraps a value that is
  *exactly* one link; a value that merely contains one stays literal text, so
  surrounding words can't be silently dropped.
- **No variant keys.** No `value`-vs-`values` pair where setting one implies the
  other is absent. Metadata Menu has no conditional fields, so it would render
  both as editable everywhere and guide authors no better than raw YAML.

`resolveMetaRows` (`src/lib/card-meta.ts`) is the single decision point: it folds
the named shorthands `when` / `medium` / `roles` / `puzzle_type` / `difficulty`
in at the front (a card must not express the same fact twice) and returns
display rows. `GenericRenderer` takes the result, and is the only renderer that
does — `WorkRenderer`, which kept its own `when`/`roles` `<dl>`, was deleted for
that reason (see the renderer-registry note below).

`difficulty` and `puzzle_type` stay named fields rather than authored `meta`
rows because `difficulty` feeds three renderings, not one.

### Difficulty is parsed once and rendered as stars

`src/lib/difficulty.ts` owns the whole of it. LMD rates a puzzle 1–5 and words
it "Level 3 (Medium)", which is what frontmatter carries — that string stays the
source of truth (it's what the LMD page says, and it round-trips on a re-rate),
but it isn't what a reader reads and it sorts alphabetically, which files Level 5
next to Level 1. So `parseDifficultyLevel` reads the rating out once and four
consumers render it:

- the card's credits row (`resolveMetaRows`) — `★★★☆☆`, with an `ariaLabel` so a
  screen reader says "Difficulty 3 out of 5" rather than five star characters
- `puzzleDifficultyGenerator` (`filter-generators.ts`) — the `what:puzzles/level-3`
  filter tag
- `generatedDisplayName` — that value's label in the panel, the same stars
- `resolveSortValue` (`folder-sort.ts`) — the value `what/puzzles`'s declared
  `sort: difficulty asc` orders its cards by (rung 5 of the ranking chain)

A string it can't read (`Fiendish`) falls back to its authored text and
generates no tag: better a card that says what was written than one that
invents a rating.

The generator is the first to read a *field* rather than a date, which it does
by declaring `difficulty` as an override key — the existing frontmatter ??
cascade plumbing then hands it over, and no new channel is needed. Its values
are rooted at `what:puzzles` so they drill in under Puzzles beside the series;
only puzzles carry a `difficulty:`, which is what keeps that rooting honest.

Puzzle listings therefore *don't* repeat the rating in their description —
`cardDescriptionParts` is `puzzle_type` alone, because the star chip is already
on every preview.

### Affiliations are a pool-wide closure, not a filter generator

`who:*` values (the employers, plus `who:me`) are **affiliations**: a
`.tag.yaml` declares `seeds:` (content paths) and a card belongs to that value
if it is a seed, or if it tags a member — transitively.

```yaml
# src/content/who/seethrough.tag.yaml
name: SeeThrough Studios
seeds:
  - where/work/seethrough
```

That reaches the studio card, then the 20 cards tagging it, then 5 older posts
that name only *Particulars* and never named the studio. The transitive hop is
the entire point — it picks up content that predates the organisation's own
card. A seed may also name a **container** folder (`who/me` seeds
`where/contact`, which has no card): its children carry it as their path tag, so
the same edge rule reaches them with no special case. Folder descendants are
free for the same reason — `derivePathTags` already gives every card its parent.

**This is deliberately not a `FilterGenerator`.** A generator's
`apply(tags, card)` decides one card from its own date and overrides;
affiliation membership is a fixed point over every card's tags and can only be
decided once, over the pool. So it is a separate pass:

- `computeAffiliationTags` (`src/lib/affiliations.ts`) is the pure decision —
  BFS from the seeds over a reverse-tag index, `members` set per declaration so
  cycles terminate.
- `getAllCards()` runs it after every card has resolved and merges the result.
  `resolveCard()` stays per-card and pure. Membership is computed over the
  **whole** pool, hidden cards included — a draft is still a real link in the
  chain, and skipping it would silently sever the closure behind it.
- `discoverAffiliations` (`tag-registry.ts`) reads the seed lists, since
  `.tag.yaml` is already walked there. This is a second tree walk per
  `getAllCards()`; don't memoise it, or a dev-time YAML edit goes stale.

**A nested value needs its container declared.** `filterVisibleNodes`
(`browse-helpers.ts`) drops any node that isn't `declared` *and recurses into
children*, so an undeclared parent takes its perfectly-declared children down
with it — silently, with no error and a filter that simply isn't in the panel.
`buildTagHierarchy` synthesises the ancestor node for `who:collaborators/jetpack`,
but synthesised is not declared. Every nested value on the site therefore needs a
container `_config.yaml` (`who/collaborators/`, `who/employers/`, mirroring
`where/work/` and `what/puzzles/`). This bites hardest with affiliations, since
they're the one filter kind with no folder of content behind them to prompt you
to make one.

An affiliation value never appears in any markdown, so
`generate-stack-manifest.mjs` enumerates `.tag.yaml`-declared values explicitly
— without that they'd fall back to raw (long) URL encoding.

The trap this creates: an affiliation is named after the organisation, and every
card in the closure's *first* hop also carries the card-backed tag for that
organisation's own card, which resolves to the same name. Left alone Particulars
showed two chips both reading "SeeThrough Studios". `computeCardTagDisplay` takes
an optional `labelOf` and drops a chip whose label is already on the card;
earlier wins, so the authored card-linking tag survives. Cards deeper in the
closure have no twin and keep their affiliation chip, which is exactly where it
tells you something. Both chip call sites (`GenericRenderer`, `BrowseCard`) pass
`labelOf` — a new one that doesn't will reintroduce the duplicate.

### Action links are resolved, never read raw

`resolveActions` (`src/lib/card-actions.ts`) decides the masthead's "go do it"
links. Most cards author them as `actions:` rows; puzzles instead carry
`sudokupad_url` and `url` as named fields (both are load-bearing elsewhere), and
those fold in as *Play* and *LMD* the same way `medium` folds
into a meta row. `GenericRenderer` renders whatever comes back — it does not
filter, reorder, or reach for `data.actions` itself.

This fold is why there is no `PuzzleRenderer`. It was retired once its meta rows
and play link became ordinary folded fields: a puzzle is a `renderer: card` like
anything else, and `puzzle` now resolves to `GenericRenderer` by fallback.

`WorkRenderer` went the same way (issue #89), and **`COLLECTION_RENDERERS` is
now empty**. Registration is still mandatory — an unregistered name is not an
error, it is a silent fallback — but nothing has needed registering. The
cautionary tale is worth keeping: a dedicated renderer starts as "the two fields
this folder has extra" and then silently *lacks* everything `GenericRenderer`
grew afterwards. `WorkRenderer` rendered a header image, a `when`/`roles` `<dl>`
and the body, and that was all — so the six `where/work/*` cards had no tag
chips, no gallery and no "Cards about this", which was the only route from the
SeeThrough Studios card to the 25-card affiliation closure behind it. Nobody
noticed for as long as they did because the folder cascade was dead in
production (#88) and prod had been serving `GenericRenderer` all along.

Before adding a card renderer, fold the fields instead: a named frontmatter
field that folds into `resolveMetaRows` or `resolveActions` costs one line and
keeps the card in the one renderer everything else improves.

An action also carries a **`kind`** — `play` / `buy` / `read` / `source` /
`site` (`ACTION_KINDS`) — because 13 cards word their actions 16 different ways
and the `why:*` generators need intent, not prose. Two rulings hold the line: an
app-store or Steam link is `play`, since for software the store *is* how you get
to play it (which is why `buyable` is one card, not seven); and the folded
`sudokupad_url` is `play` while the LMD page is `site`. `kind` is optional —
an unkinded action renders normally and simply tells the generators nothing —
so a new action row that forgets it fails silently, in the direction of
under-tagging.

### The `why` dimension is affordances, and only two of five are derived

`why` is the one dimension with no cards under it: `src/content/why/` holds
declarations only, because "what this offers you" is a property of a card that
lives somewhere else. `why/_config.yaml` therefore declares **no `name`** — like
`what/_config.yaml` it is panel-only config, and a dimension root is not a
filter value, so an identity there would display nowhere while making
`generate-card-templates.mjs` emit a Templater scaffold for creating cards in a
folder that must never hold one.

Two of its five values are generated (`whyAffordanceGenerator`, decisions in
`src/lib/why-tags.ts`):

| value | predicate | override |
|---|---|---|
| `why:playable` | any resolved action with `kind: play` | `playable: always \| never` |
| `why:buyable` | any resolved action with `kind: buy` | `buyable: always \| never` |

Three override keys exist rather than one `why:`-shaped field: the affordances
are independent facts and a card is routinely two of them, so a single field
would have to carry a list through override plumbing that is string-only by
design. An unrecognised override value falls through to the derivation — a
typo should leave a card where it was, not silently drop it out of a filter.

**`why:viewable` is not derived at all (issue #96).** It used to be a header
`image` plus a markdown-stripped body under a length threshold — "does this
have a picture", which is a different question from "is this worth looking
at", and the two questions disagreed on most of the Instagram-era archive: the
mechanical version caught 133 cards, dominated by micro-posts, while missing
nothing about which ones were actually striking. `viewable: always` is now the
*only* way a card becomes `why:viewable` — pure curation, the same shape as
the two `learn/*` topics below. `viewable: never` still parses but is a no-op,
kept only so the three override keys stay a uniform shape.

The two `why:learn/*` values, `why:learn/game-development` and
`why:learn/travel`, are **authored** the same way, and `why/learn/_config.yaml`
is load-bearing for exactly the reason the affiliation containers are:
`filterVisibleNodes` drops an undeclared node *and recurses into its
children*, so an undeclared container takes both perfectly-declared topics out
of the panel with no error anywhere.

### Canonical tag slugs in content; aliases only in tag YAML

Aliases in `src/content.config.ts` tag schema are a runtime safety net, not a feature to rely on. Content should always link to canonical slugs; aliased links in content are a data bug.

### Tags are authored with `/`, canonical with `:`

`src/content` is an Obsidian vault and `tags` is one of Obsidian's reserved
frontmatter keys — it rejects `:` as an invalid tag name, which cost
autocomplete, the tag pane and tag search on every dimensioned tag. So content
is authored in Obsidian's **nested-tag form**:

```yaml
tags:
  - where/work/seethrough
  - when/released
```

`normaliseAuthoredTag` (`src/lib/five-w.ts`) rewrites the leading segment to the
canonical `where:work/seethrough` — which stays the form used **everywhere
downstream**: URLs, `src/data/*.generated.ts`, lens/tag YAML,
`stack-manifest.json` and every `indexOf(':')` split site. Conversion fires only
when the first `/`-segment is a known dimension and something follows it, so
dimensionless tags (`interactive`, and even the bare tag `why`) pass through
untouched, and the function is idempotent.

Three call sites, and they are the whole boundary:

- the `tags` field transform in `src/content.config.ts`
- the `_config.yaml` cascade in `resolveFolderCascade` (`src/lib/folder-config.ts`)
- `scripts/generate-stack-manifest.mjs`, which reads frontmatter through
  gray-matter and so never sees the schema transform

**Anything else that reads raw frontmatter tags must normalise them itself** —
that includes tests that scan markdown directly (see
`project-status-vacate.test.ts`, which asserts against the authored form). Body
content is unaffected: the `card:` / `collection:` / `tag:` link protocols are
markdown link targets, not tags, and keep their colons.

A side benefit worth not undoing: without a colon, these values no longer need
YAML quoting.

### Old-URL redirects are generated, never hand-edited

`src/data/redirects.generated.ts` is produced by `scripts/generate-redirects.mjs`
(a `predev`/`prebuild` step) from the retired Jekyll site on the `master` branch —
`_config.yml` for the permalink patterns, `collections/` for the inventory —
resolved against the current `src/content` tree. `astro.config.mjs` feeds the map
to Astro's `redirects`, which emits one meta-refresh page per entry in the static
build (GitHub Pages has no server-side redirects).

All resolution logic is pure and tested in `src/lib/redirect-map.ts`. Two rules
hold: every old URL gets a redirect (an unresolvable one falls back to the
closest lens rather than 404ing), and every fallback is reported — in
`UNRESOLVED_OLD_URLS`, in the generated file's header, and on stdout. If content
moves, re-run `npm run generate:redirects` and check the report.

A fallback caused by a card's **status** rather than by a missing card is
additionally attributed to that card in `ORPHANED_OLD_URLS`. `buildRedirectMap`
resolves twice for this — against the reachable uids (which the map is built
from, so it can never aim at a 404) and against every uid in the tree — and a
URL that fails the first but resolves in the second was orphaned by its own
card. The audit lens turns that into the `orphaned-old-url` finding, naming the
cards; publishing one restores its old URL and drops it off the list.

### CSS-first responsive, no JS breakpoint detection

Layout responds to viewport via media queries. `matchMedia` in JS is reserved for cases where *interaction state itself* differs by breakpoint (e.g. a desktop-only peek state), not for layout switching. Document the exception narrowly when it applies.

Two sanctioned escapes exist, and they are the only ones:

- **A breakpoint-varying value the applier needs** is declared in `:root`,
  overridden in the desktop media block, and read back through
  `getComputedStyle`. `--stack-scroll-peek` is the one instance. The breakpoint
  stays in CSS; JS only resolves a number.
- **`prefers-reduced-motion`** is read with `matchMedia` in `CardStack.svelte`,
  because `window.scrollTo`'s `behavior` *overrides* a CSS `scroll-behavior`
  rather than consulting it, so there is nothing CSS-side to defer to. It is a
  user preference, not a layout breakpoint, and no layout is decided from it.

Everything else the reduced-motion preference touches is decided in CSS, and
read back as CSS — see `transitionWillFire` below.

## Testing

### Test location and commands

Tests are co-located with source as `src/**/*.test.ts`. Shared utilities live in `src/test/`.

The one naming rule: a test that **mounts a Svelte island** is named
`*.island.test.ts`, which routes it to the `island` vitest project below.
Everything else keeps the plain `*.test.ts` name.

```bash
npm test          # run once (CI / regression gate)
npm run test:watch  # watch mode during development
```

### Two vitest projects, because one Vite config cannot be both

`vitest.config.ts` is a thin root that lists two projects; `npx vitest run` runs
both. Each has its own Vite config, and the split is the whole answer to issue
#95:

| project | config | include | resolves through |
|---|---|---|---|
| `astro` | `vitest.astro.config.ts` | `src/**/*.test.ts` | Astro's Vite config (`getViteConfig`), `viteEnvironment: "ssr"` |
| `island` | `vitest.island.config.ts` | `src/**/*.island.test.ts` | a **plain** Vite config: `@sveltejs/vite-plugin-svelte` + `resolve.conditions: ['browser']`, environment `happy-dom` |

The `astro` project uses a custom environment at `src/test/vitest-env.ts` named
`astro-happy-dom`. That is required because the built-in `happy-dom` Vitest
environment sets `viteEnvironment: "client"`, causing the Astro Vite plugin to
return browser stubs for `.astro` imports instead of real SSR component
factories. The custom environment sets `viteEnvironment: "ssr"` while still
providing happy-dom DOM globals.

**Never rename that file to `happy-dom`** — the name is hardcoded in Vitest to
use `viteEnvironment: "client"`.

The `island` project pays the exact opposite cost, and it is the rule that keeps
the split honest: **an `*.island.test.ts` must not import a `.astro` file.**
There is no Astro plugin in that project to transform one. Island components
import only `.svelte` and `.ts`, so this holds today; a test that needs both a
mounted island and a rendered `.astro` component needs a browser, not a third
config.

`*.island.test.ts` is excluded from the `astro` project by filename, so a test
runs in exactly one of the two.

### DOM API gaps in happy-dom

- `document.startViewTransition` — not available; VT paths must be guarded and tested via instant-fallback branch only.
- `element.animate()` — not available in this happy-dom version; future StackNav tests that exercise animation paths must guard with `typeof el.animate === 'function'`.

### A Svelte island mounts only in the `island` project

`mount()` from `svelte` throws `lifecycle_function_unavailable` in the **`astro`**
project. The `viteEnvironment: "ssr"` that `.astro` imports require (see above)
also makes Svelte resolve to its **server** build, which has no client
lifecycle — and because that resolution comes from Astro's Vite config via
`getViteConfig`, it is project-wide *within that project*: neither a
`@vitest-environment happy-dom` docblock nor `--environment happy-dom` changes
it. Name a mount test `*.island.test.ts` instead and it runs in the sibling
project, where Svelte is its client build and `mount()`, `$effect`, `onMount`
and event handlers all work. `CardStack.island.test.ts` is the reference.

Three kinds of island coverage, and the boundaries between them are real:

- **Client mount** (`*.island.test.ts`) — the mount path, effects, the delegated
  click handlers, the `cardparam` / `popstate` listeners, and every store
  mutation they make. This is where orchestration is asserted as behaviour.
- **Server render** — `render()` from `svelte/server`, in the `astro` project.
  That project's `"ssr"` environment is precisely what makes the server renderer
  available, so anything a component does *during server render* is testable
  there and only there. `CardStack.ssr-isolation.test.ts` (#102) uses it to
  render two pages back to back through one module instance, which is what
  `astro build`'s prerenderer does and what a browser never does.
- **Neither** — View Transitions (happy-dom has no
  `document.startViewTransition`, so `startVT` stays undefined and every push
  takes the instant-fallback branch), real layout and geometry, CSS
  transitions, and scroll. Those still need browser verification.

A **source-level wiring guard** (reading the component as text) is now the last
resort, not the default. It is still the right tool for asserting an *absence* —
"`initFromUrl` marks nothing read" has no behaviour to observe — which is all
`CardStack.cold-load.test.ts` still does.

### Component tests

Use `experimental_AstroContainer` from `astro/container` to render `.astro` components in isolation:

```ts
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
const container = await AstroContainer.create();
const html = await container.renderToString(MyComponent, { props: { ... } });
```

Parse the returned HTML string with `document.createElement('div')` + `innerHTML` and assert against `textContent` or DOM queries.

### Pure logic and testability

The "decisions are pure, effects are thin" global rule (`~/.claude/rules/architecture.md`) is also this project's testing contract. Decision functions are extracted to `src/lib/` so they can be imported and tested without DOM setup. The thin DOM applier that writes the result is not unit-tested directly — the decision function is where the logic (and the test coverage) lives.

## Workflow

### Content is authored in a dedicated Obsidian vault

`src/content` is its own Obsidian vault (settings committed at
`src/content/.obsidian/`), not a folder of the main notes vault. See
`docs/content-vault.md`.

Two consequences for code:

- Non-card markdown that must live inside `src/content` (Templater scaffolds in
  `_templates/`) is kept out of the collection by `CONTENT_GLOB_PATTERN`
  (`src/lib/content-glob.ts`), which excludes underscore-prefixed *directories*
  as well as underscore-prefixed files. Put anything similar under a `_`-folder.
- Pasted images arrive colocated in the card folder as plain markdown
  (`![](file.png)`), by vault setting — never assume a wikilink converter.
- The Templater scaffolds in `src/content/_templates/` are **generated** — one per
  container folder, by `scripts/generate-card-templates.mjs` (decisions in
  `src/lib/templater-scaffold.ts`), wired into `predev`/`prebuild`. Never hand-edit
  one; change the generator and re-run `npm run generate:card-templates`. Adding a
  container folder or a schema field means a regen. See
  `src/content/_templates/README.md`.

### `inspected` is a permanent editorial flag, not a pre-MVP sweep

`inspected` (`src/content.config.ts`) answers one question forever: has a
human read this card end to end since its last change? It started as a
one-off pre-launch backfill and stayed — the mechanism turned out to be a
general-purpose "something changed this without me looking" signal, useful
long after the initial sweep finishes. Three things read it, and all three
are permanent:

- **`scripts/backfill-inspected.mjs`** stamps `inspected: false` onto any card
  that lacks the key, so Obsidian's Properties view has a checkbox to render.
  Idempotent, run by hand — never wired into `predev`/`prebuild`, since it
  mutates authored content and must never race a concurrent Obsidian edit.
- **The `not-inspected` finding** on the dev-only audit lens (`src/lib/audit.ts`)
  — the flat worklist view, grouped with every other content finding.
- **The dev-only `why:uninspected` filter** (`src/lib/uninspected-facet.ts`) —
  the same flag, but combinable with every other dimension while browsing
  ("uninspected puzzles", "uninspected posts from 2019"), which the flat
  audit list can't do. See that file for why it's deliberately *not* a
  `FilterGenerator`: the value must never receive a stack-manifest short code.

**The rule this drives:** any script, generator or AI agent that changes a
card's frontmatter **or** body — not Paul editing directly in Obsidian — must
set `inspected: false` on that card's frontmatter as part of the same change.
An automated edit is exactly the kind of change nobody has personally read
yet, so it belongs on the worklist the flag already drives. Set it even if the
card was previously ticked `true` — an automated change is new content a
human hasn't seen, regardless of what was reviewed before it.

This does **not** apply to `content: auto-sync` commits that carry Paul's own
edits from Obsidian mobile — those are authored directly by him and need no
re-flagging. It also doesn't apply to `scripts/backfill-inspected.mjs` itself,
which only ever writes `inspected: false` onto a card that has no `inspected`
key at all — that is the one write this rule doesn't cover, since there was
nothing there to have been "read" yet.

New cards from the Templater scaffold do **not** get `inspected: false` by
default — the field is commented out there, deliberately. A card Paul writes
himself needs no confirmation of his own words; the flag is scoped to content
something *other than him* touched.

### Experiments live on dev-only routes

`/experiment` should create throwaway pages under `src/pages/experiments/` with synthetic fixtures (e.g. 10 fake cards for an overflow experiment). Don't prototype by mutating production components and reverting.

Note: Astro excludes directories starting with `_` from routing, so `_experiments` does **not** work — use `experiments` (no underscore).

### Plans must name the selectors and CSS variables they touch

Given the selector contract and CSS custom property convention above, a plan file should explicitly list any new class names it adds to the JS contract and any new CSS variables it introduces. Reviewers and future sessions should see this without re-reading the diff.

## Agent skills

### Issue tracker

GitHub Issues on `pdyxs/pdyxs.github.io`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, used verbatim as label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context, but the glossary and decision records live in the Obsidian vault at
`~/notes/Creativity/Projects/pdyxs.wtf/`, not in this repo. See `docs/agents/domain.md`.
