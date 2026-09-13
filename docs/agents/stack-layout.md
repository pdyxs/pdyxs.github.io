# The card stack: geometry, motion, scroll

How the stack is drawn and how it moves. State, fragments and history live in
[stack-state.md](stack-state.md).

## One in-flow card, N absolutely-positioned siblings

The desktop stack used to be **three layout systems glued together** —
absolutely-positioned left strips, an in-flow flex `.active-card-col`, in-flow
right strips, plus `.fan-corner` L-connectors and `.stack-overflow` panels
standing in for the hidden cards. All three are gone (issue #109), replaced by
one pure function.

Every entry renders one `.stack-card`, all of them siblings inside
`.card-stack-inner`, in `entries` order and keyed by `slot`. The **active card
is the only in-flow node** — it gives the container its height — and every other
card is `position: absolute`, placed by `computeGeometry`
(`src/lib/stack/layout/stack-geometry.ts`). **Painting order does the occlusion**: a behind
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

## Card body expand/collapse

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

## A pile is the cards, and hovering it splits the slot they share

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
  the `--color-selected-*` rules in [styling.md](styling.md).
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

## The fan is drawn before paint, with its titles in a load state

The second half of the same script (issue #122). Reserving the space still left
it EMPTY until the island landed — measured on a warm wired dev server, the
skeleton is in the DOM ~30ms *before* FCP and the real spines arrive ~300-400ms
after it, and that gap is what a visitor reads as "the stack doesn't show
straight away".

The split is forced rather than chosen: the script can count `from`/`to`
entries out of the URL, but it cannot know their TITLES —
`stack-manifest.json` is 46KB and arrives as a JS chunk long after the HTML. So
**shape immediately, titles at hydration**, and the load state is a static
dither bar sized and placed as the vertical title run it stands in for. Static
for #119's reasons, restated: no grey to shimmer in, `opacity` is a bug, and a
moving gradient over a dithered surface is the re-rasterisation the fixed grid
exists to prevent.

**The layer is not in the island, and that was measured, twice.** It began as a
trailing child of `#card-stack`, on the reasoning that hydration walks the
children it expects and never looks past them. It looks: with the skeleton
there, **0 of 51** tagged SSR nodes survived hydration and the active card's
element reference was replaced — #120's failure exactly, which on a lens page
means the filter panel and the browse results never come alive. Without it,
51 of 51. So `StackNav.astro` renders a `.stack-shell` wrapper the island does
not own, and the layer hangs off that.

Four things that fall out of being outside `#card-stack`:

- **It inherits none of `#card-stack`'s rules.** Every rule that places a real
  card is written `#card-stack .stack-card`, so a skeleton spine states what it
  is directly (`.stack-skeleton-card`) rather than borrowing them.
- **It draws a SPINE, not a card.** Only the leftmost `--spine-width` of a
  collapsed card is ever on screen; the rest is cropped by the card in front.
  Drawing the sliver is also what keeps the layer out of the active card's way
  with **no z-index anywhere** — a behind spine sits entirely to its left, and
  an ahead spine overlaps only the 4px `forwardOverlap` tuck that belongs on
  top. Being the last child is the whole of the painting order, which is why
  the table hands each side's spines over in `z` order.
- **`--stack-card-width` and `--max-width` are restated on the shell**, since
  it cannot read `#card-stack`'s. Not a fork: `--stack-card-width` is the same
  declaration, differing only in where it reads the slot counts from, and for
  the skeleton's whole lifetime those are on `<html>` where both elements see
  them identically. `--max-width` is written inline by `StackNav` from the same
  route value `#card-stack` gets — without it a 960px lens's fan is measured
  against the 680px default.
- **Desktop only**, like the reservation it completes. At mobile
  `.card-stack-inner` is `display: contents` and every card is an in-flow row,
  so nothing is reserved and a skeleton there would be a different job with a
  different failure mode.

Still no arithmetic in the script. `fanSkeletonTable`
(`src/lib/stack/layout/stack-skeleton.ts`) is a second build-time table beside
`fanReservationTable`, computed by running `computeGeometry` and emitting
`left`/`top` as finished CSS lengths — ahead ones as `calc(100% + Npx)`, which
works because the table is built at `activeWidth: 0` (so the term IS the offset)
and the layer's box is exactly one active card wide. Both tables share
`saturationPoint`, because they are read with the same clamped count and must
not disagree about where clamping starts.

**`CardStack` drops the layer at both of `initFromUrl`'s exits, and only
there.** Earlier — at mount, say — would replace a drawn fan with an empty
strip for however long the store write takes, reintroducing the gap it exists
to cover. Later — after the fetches — would leave the skeleton and the real
spines on screen together. The moment after `initFromUrl`'s `await tick()` is
the one frame at which the swap costs nothing.

## One scroll owner, and the peek is doing two jobs

`scrollActiveIntoView(behavior)` in `CardStack.svelte` is the only thing that
scrolls the stack, called from a `$effect` — reactive for the same reason the
layout is: the store is what moved, and a handler that has to *remember* to
scroll is how there came to be four of them. It replaced four
`scrollIntoView({ block: 'nearest' })` sites, and `nearest` was precisely the
wrong primitive: it does nothing when the target is already partly visible,
which in a stack is always.

The rule is `scrollTargetFor(activeCardTop, scrollY, peek)`
(`src/lib/stack/layout/stack-geometry.ts`): the active card's header at the top of the
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
(`scrollBehaviourFor`, `src/lib/stack/layout/stack-motion.ts`). A rebuild splices entries in
one fetch at a time and each one needs a correcting scroll — smoothing those is
the page fighting itself, and on first paint it races the browser and loses
visibly.

**The scroll aims only once the layout has stopped moving** (`scrollSettleAction`,
`src/lib/stack/layout/stack-motion.ts`), and this is the crop-vs-reflow asymmetry reaching a
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

## Reduced motion reads the computed style, not the preference

`--stack-motion-ms` / `--stack-reveal-ms` / `--stack-stuck-ms` are zeroed in a
`prefers-reduced-motion` block, and `.body-wrapper`'s collapse with them.

That is what makes `transitionWillFire` (`src/lib/stack/layout/stack-motion.ts`) necessary.
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

## Motion is armed one frame late, on purpose

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

## The home lens is a 12-column grid whose cells are stated before their cards

`home.lens.yaml`'s `config.slots` is the whole of the front page's layout
(issues #129–#133). Four rules hold it together:

- **`parseHomeSlots` (`src/lib/browse/home/home-slots.ts`) validates AND normalises, at
  generation time.** `scripts/generate-lens-registry.mjs` bakes the normalised
  slots into `lenses.generated.ts`, so that file shows what actually renders
  rather than the author's shorthand, and an authoring slip (`spann: 4`,
  `side: left`, an unknown `variant:`) is a build error naming the slot's
  1-based number. `.strict()` is what makes the typo an error rather than a
  silently ignored key. The module is a deliberate **leaf** — the generator
  must not reach `lens-registry.ts`, which is also why this does not live in
  `frontpage.ts`.
- **All tiers are emitted and CSS picks.** `resolveSlotSpans` /
  `resolveSlotRows` cascade upward, mobile-first, onto `--slot-span-small` /
  `-large` and `--slot-rows-small` / `-large`; the base rules are a literal
  `span 12` / `span 1` and the two breakpoints (681px, 1000px) are literals in
  `src/styles/home.css`. No `matchMedia` — and no container query either, since
  `container-type` would make the slot a containing block for the fixed dither.
- **One flat grid, `side: right` as `span N / -1`.** No `grid-auto-flow: dense`
  (it backfills a hole with a *later* slot, which silently breaks config
  order), no rail container, no sum-to-12 validation. A hole is visible; a
  reordering is not.
- **The grid is server-rendered from the config alone and only its interiors
  are provisional.** `HomeLensSlots` renders every cell — spans, rows, labels,
  `See more →` — with a placeholder interior while `resolvedSlots === null`.
  There is no layer and no removal moment, and `null` is not `[]`: a slot whose
  card resolves to `null` draws chrome and no interior *permanently*, which
  reads correctly only because the rest of the page has filled.

**The floor is per variant and it is measured.** `BROWSE_CARD_VARIANTS`
(`src/lib/browse/results/browse-card-variants.ts`) holds `minHeight` for each variant, written
onto both `BrowseCard`'s `.browse-card-content` and the placeholder's interior
as `--browse-card-min-height`, so the swap can only grow into space already
held. It covers the interior and **not** the 16/9 banner, whose height is a
function of the card's width — the placeholder draws its own band instead.
`BrowseCard.island.test.ts` sums the rendered card's own vertical parts and
asserts the record agrees, because a floor disagreeing with the card it holds
space for is exactly the document-height jump the placeholder exists to prevent
and nothing else would catch it.

## Stable selector contract

These class names are a CSS/layout contract — renaming any of them is a CardStack.svelte + CSS refactor, not a local change:

- `#card-stack`, `.card-stack-inner`
- `.stack-card`, `.stack-card--active`, `.stack-card--collapsed`, `.stack-card--page`
- `.stack-card-spine`, `.stack-card-spine-inner`, `.stack-card-spine-title`
- `.card-header`, `.card-header-sentinel`, `.card-header--stuck`
- `.stack-card--revealing`, `#card-stack.stack-motion`
- `.body-wrapper`, `.body-wrapper.open`
- `.stack-card-body`, `.stack-card-body-inner`
- `data-role="behind|active|ahead"` and `data-piled` (written by the applier)
- `data-stack-resizing` (issue #126 — written by `holdWhileAssemblyResizes` onto
  the incoming `.stack-card` for the length of the assembly's width transition;
  the name lives in `src/lib/stack/layout/stack-motion.ts`)
- `.stack-pile`, `.stack-pile-inner`, `.stack-pile-label`, `.stack-pile-bands`,
  `.stack-pile-band`, `.stack-pile-band-text` (island-rendered, desktop only)
- `.stack-shell`, `.stack-skeleton`, `.stack-skeleton-inner`,
  `.stack-skeleton-card`, `.stack-skeleton-title` (issue #122 — written by
  `Base.astro`'s inline script, removed by `CardStack`, desktop only). The
  shell is the island's own wrapper in `StackNav.astro`; the rest exist only
  between first paint and hydration.
- `.fp-slot-grid`, `.fp-slot`, `.fp-slot--rail`, `.fp-slot-label`,
  `.fp-see-more` (issues #131, #132 — the home lens's 12-column slot grid).
  These are a **scoped `<style>` in `HomeLensSlots.svelte`**, together with
  `.fp-slot-stack`, `.fp-slot-placeholder*`, `.fp-slot-stalled` and
  `.fp-slot-card-list`. They render inside the home lens *fragment*, which used
  to be why the first five had to live in `src/styles/home.css` (now deleted) —
  `cssCodeSplit: false` retires that reason, and nothing in the grid is
  qualified on stack position, so the whole family moved together. They stay on
  this list because the class names are still a layout contract: renaming one is
  a `HomeLensSlots.svelte` refactor, and `--slot-span-*` / `--slot-rows-*` /
  `--stack-direction-*` / `--stack-split` are written onto `.fp-slot` /
  `.fp-slot-stack` by that island from `home-slots.ts`'s normalised config.
- `.fp-skeleton--pending`, `.fp-skeleton--failed`, `.fp-pool-error`,
  `.fp-pool-retry` (map #136 — `BrowseSkeleton.svelte`). The base rule is
  `.fp-skeleton { display: none }`; these two modifiers turn it on as island
  state, drawn by a body that has no pool yet or whose fetch failed. They are
  scoped to the island, per the islands exception in [styling.md](styling.md), and say `display: block` —
  nothing more, so the `data-stack-resizing` rule that can also reveal this box
  (issue #126) landing on top of them is a no-op rather than a fight.
- `.browse-card-item--brief` (issue #130) — the `BrowseCard` variant hook. It
  deliberately carries **no rule at all**: everything `brief` changes is either
  an element `BROWSE_CARD_VARIANTS` does not render or a number it hands to
  `--browse-card-desc-lines` / `--browse-card-min-height`.

Deleted with the geometry swap (issue #109), and not to be reintroduced:
`.fan-corner`, `.active-card-col`, `.stack-overflow*`, `data-side`,
`--stack-index`, `--num-left-collapsed`, `--num-right-collapsed`, `--i`, `--n`.

