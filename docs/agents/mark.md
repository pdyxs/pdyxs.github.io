# The suspended mark: the dot, its exit, its tools

The full stop in `pdyxs.wtf` is drawn, not typed: a dot hanging from five
threads tied to the letters around it. When the page header leaves (page →
card) the title rises, grows and drifts to the centre line while the dot stops
at the top edge and hangs there. Clicking the dot pulls the threads taut and
drops the site's global **tools**, baubles on strings, of which the palette is
the first. The favicon is the same rig.

The build plan, with the reasoning slice by slice, is
[docs/plans/suspended-mark.md](../plans/suspended-mark.md). This doc is what
holds now.

## Modules

| file | what | layer |
|---|---|---|
| `src/data/mark-rig.ts` | the five threads, authored in `/experiments/mark-editor` | data |
| `src/data/mark-tools.ts` | `MARK_TOOLS` and `ToolConfig`: which tools, where they hang, how big | data |
| `src/data/mark-icons.ts` | `MARK_ICONS`: SVG bodies in a unit box, keyed by name | data |
| `src/lib/site/mark/geometry.ts` | `poseThreads`, `tauten`, `toolPivot`, bauble physics (`stepBauble`, `baubleAt`, `trackPivot`, `DROP`/`REEL`) | pure |
| `src/lib/site/mark/motion.ts` | the dot's spring and the catch at the edge (`stepDot`), the pull → release → rest machine (`setWant`, `lapseTug`), `poseBlend`, `titleExit` / `titleExitKeyframes`, every motion constant | pure |
| `src/lib/site/mark/measure.ts` | the full stop's ink box from a canvas pixel scan, in em, with a plausibility check and a Chromium-measured fallback | pure |
| `src/lib/site/mark/exit.ts` | `slotSource`: where the dot is read from at any moment (the live title, the exit's trajectory, the hang); `caughtDot` | pure |
| `src/lib/site/mark/hang.ts` | the hanging pose with no title (`hangPose`, and `hangMarkup` for the server's copy), `HANG_DOT_INK`, `HANG_DEPTH` | pure |
| `src/lib/site/mark/tools.ts` | the generic tool decisions: `flattenTools`, `visibleTools`, `isTug`, `tautThreads`, `toolLength`, `childPivot`, `focusOrder`, `focusFallback`, `validateTools` | pure |
| `src/lib/site/mark-tools/` | the behaviours: `types.ts` (`ToolBehaviour`), `index.ts` (the registry), one file per behaviour | effect |
| `src/lib/site/presentation-event.ts` | `site:presentation`: `PresentationDetail`, `announcePresentation`, `currentPresentation`, `coldPresentation` | shared |
| `src/components/site/SuspendedMark.astro` | `<site-mark>`: the markup, every mark rule, the VT pseudo rules, and the custom element (rAF loop, SVG writes, pointer and keys) | effect |
| `src/components/site/MarkTool.astro` | one tool's markup from its config, children nested (recursive via `Astro.self`) | markup |
| `src/lib/site/palette-dom.ts` | the palette's effect layer, which the palette behaviours call; the mark never does | effect |

`<SuspendedMark />` is mounted once, in `Base.astro`, first in `<body>` and
outside `.site-wrapper` (so outside `#card-stack`): parsed before the page under
it, so a long card can't make it arrive frames after first paint. Base's
`mark={false}` turns it off, for the benches that mount their own.

The element is self-contained: everything about the page it reads goes through
one selector (`.stack-card--page .page-title-mark`) and one event. It never
writes to `#card-stack` (see [stack-state.md](stack-state.md)); the one thing it
does to an element inside it, on the trim close, is below.

## Page mode, card mode, and `site:presentation`

Where the page shows a title (any page-mode lens), the dot is that title's full
stop. Everywhere else (card mode, a cold load of `/card/...`, a page with no
stack) it hangs at the top-centre of the screen from the start.

The mark learns which from three places, read in this order at startup and then
followed:

- **`site:presentation`** on `document`, detail `{ to: 'page' | 'card', vt }`.
  CardStack announces it; the mark listens; neither imports the other, only
  `presentation-event.ts`. On the two page ↔ card View Transitions it carries
  the transition, announced right after `startViewTransition` returns (the
  browser captures the old state at its next rendering opportunity, so a
  listener can still read and name things). Every other change (the mount, a
  popstate, the trim close, the no-VT fallback) is `vt: null`. CardStack's
  `announce` drops a repeat of the last value, so each change is announced
  once.
- **`html[data-presentation]`**, the last value announced, written by
  `announcePresentation`: for a listener whose script runs after the first event
  has gone by. The island and the mark's script hydrate in no fixed order.
- **`html[data-cold-presentation]`**, the presentation the page *loads* in,
  decided before paint: the route seeds it (Base's `presentation` prop: `page`
  from `LensPage`, `card` everywhere else), and the stack's pre-paint script
  turns it `card` when the URL carries `from`/`to`. The server's hanging pose is
  drawn off it, and the mark starts from it when nothing has been announced. A
  first announcement that differs from the seed is a correction, not a return:
  no title comes down for it.

At rest in the title the overlay is document-positioned
(`site-mark[data-overlay="doc"]`), so it scrolls natively with the text and
never trails a frame; anywhere else it is fixed to the viewport, so scrolling a
card never moves it. `site-mark[data-mode]` says which mode it is drawing.

Any presentation change closes the tools and ends an exit still in flight.

## The exit and the return

**The exit is a known trajectory, not a measured one.** During a View
Transition the old title exists only as a snapshot, and nothing can read its
rect. So `titleExit(start, viewport, t)` is the header's departure as a function
of time (rise by the header's height, drift to the centre line, growth about the
slot by `TITLE_EXIT_SCALE`), measured once at rest before anything moves, and
one function drives both the snapshots (keyframes from `titleExitKeyframes`) and
the dot (sampled at the title animation's own `currentTime`). The return runs it
backwards.

Three paths, by what CardStack announces:

1. **Page → card, a View Transition.** The rule under the title
   (`.page-header-rule`, named `page-rule` by CardStack) morphs into the new
   card's `.card-header`. The mark names the title and subtitle `page-title` /
   `page-subtitle` and animates their **old** images with WAAPI on
   `document.documentElement` (`pseudoElement: '::view-transition-old(...)'`).
   The overlay is named `site-mark` and renders **live** through the
   transition (old image `display: none`, new image and group `animation:
   none`), so the rAF-drawn dot keeps moving over the frozen page and is caught
   at the top edge.
2. **Card → page, a View Transition** (the last card closing to home, which is
   no longer in the stack). The same, on the **new** images. The dot hangs until
   `updateCallbackDone`, then measures the returning title and follows
   `titleExit`'s offset from the **live** slot (`slotSource` → `tracked`),
   because the browser keeps placing a new-side snapshot on its element while
   the stack may still be moving the page card.
3. **Card → page, no transition: the trim close.** Closing back onto a home
   already in the stack (`?from=0` → `/`) only trims the stack; the stack's own
   motion brings home back. The mark answers `{ to: 'page', vt: null }` by
   running `titleExit` in `'return'` on the **live** `.page-title` and
   `.page-subtitle` (`element.animate`, `transform` only, `fill: both`,
   cancelled when it ends), reading the slot off the live title each frame. It
   changes no structure, class, attribute or inline style in the stack, and
   moves no layout; that is why it is allowed (see
   [stack-state.md](stack-state.md)).

Every animation is cancelled when its run ends: a `fill: both` outlives the
pseudo it targeted and would apply its end transform to the next transition's
same-named pseudo.

**The names are CSS, gated by `html[data-mark-vt]`.** This is the one
exception to stack-state.md's "inject via `element.style`" rule. The mark sets
`html[data-mark-vt]` when the transition is announced and removes it on
`finished`; a rule in `SuspendedMark.astro` names
`html[data-mark-vt='title'] .stack-card--page > .page-header .page-title` (and
the subtitle), and `html[data-mark-vt] .site-mark-overlay`. The reason: the
returning title has to be named in the **new** state, the mark has no hook in
CardStack's update callback, and by the time `updateCallbackDone` settles the
browser has already captured it. A selector names whatever is laid out at each
capture, and only the sole entry is ever `stack-card--page`, so the name can't
be duplicated. `data-mark-vt='mark'` (reduced motion) names only the overlay:
the stack's transition still runs, the title swaps with the root, and the dot
jumps to its end state live.

The pseudo rules for `site-mark`, `page-title` and `page-subtitle` live in
`SuspendedMark.astro`'s `is:global` block, not in `layout.css`: they are the
mark's names, and CardStack never sees them.

## The hang

The hanging mark has no title to measure, so its size has **one source**, in
`tokens.css`:

- `--page-title-size`: `.page-title`'s font-size, a token so the hang can be
  sized on a page with no title.
- `--mark-hang-em`: `--page-title-size × 3`, the title's em grown by the exit
  (`TITLE_EXIT_SCALE`, `motion.ts`).
- `--mark-hang-size`: `--mark-hang-em × 0.095`, the full stop's ink width
  (`HANG_DOT_INK`, `hang.ts`).

The script never computes the hang: it reads both tokens back, resolved, off
`.site-mark-hang-probe` (width is the size, height the em). The two factors
exist as TS numbers too, for code that needs them; **`hang.test.ts` pins
`TITLE_EXIT_SCALE` and `HANG_DOT_INK` to the CSS**, so change a factor in both
places or the test fails.

The pose needs no title because the rig's hang control points are em offsets
from the attach points, and the anchors, on letters that have left, sit
`HANG_DEPTH` (0.6) em above the dot. So the pose is the dot's centre plus em ×
fixed numbers. **The server draws it**: `.site-mark-hang` is a second SVG laid
out at build time by `hangMarkup` (1/1000 em about the dot's centre, as its
viewBox), sized by `--mark-hang-em`, pinned to the top-centre, shown on
`html[data-cold-presentation='card']` until `html[data-mark-ready]`, and for good
without JS. The script's first draw is the same picture, so the swap is
invisible. After an exit the dot eases onto exactly this pose (`grownDot`,
`anchorSlot`), so a hang after an exit and a cold hang are one state.

`html[data-mark-ready]` is set while the live overlay is drawn: it hides the
title's real period (`.page-title-mark` goes transparent), retires the server's
pose, and shows the hit button. Until then, and without JS, the title is just
text.

## Tools

Three parts, each changeable without the other two:

1. **Config**, `src/data/mark-tools.ts`, hand-edited. Every string length,
   radius, icon, label and order is here and nowhere else. A top-level tool
   names a `thread` (an index into `MARK_RIG.threads`); a child sits in its
   parent's `children` and has no thread. Optional `description` becomes an SVG
   `<desc>` the bauble's `aria-describedby` names: say the keyboard path there
   when a label can't carry it.
2. **Icons**, `src/data/mark-icons.ts`. An SVG body in a unit box about the
   bauble's centre (the body circle is radius 1), scaled by the tool's
   `radius`. Colour only through `.site-mark-icon-ink` / `.site-mark-icon-paper`
   (fills), never a literal colour, and no strokes: they would scale with the
   radius. The body circle itself is the bauble's, not the icon's.
3. **Behaviour**, `src/lib/site/mark-tools/`. One file per behaviour,
   implementing `ToolBehaviour` (`types.ts`), registered by key in `index.ts`'s
   `BUILT_IN`.

```ts
interface ToolBehaviour {
  kind: 'drag' | 'press';                         // decides the pointer wiring
  shown?(): boolean;                              // hanging right now? absent: always
  subscribe?(changed: () => void): () => void;    // when shown() may have changed
  press?(): void;                                 // click, or Enter/Space on the bauble
  dragStart?(p: ViewportPoint): void;             // pointer captured on the bauble
  dragMove?(p: ViewportPoint): void;
  dragEnd?(p: ViewportPoint, cancelled: boolean): void;  // let go, or pointercancel/Escape
  key?(e: KeyboardEvent): boolean;                // keydown on the focused bauble; true = handled
}
```

The mark draws every tool the same way and knows nothing about what any does.
It looks a behaviour up by key each time it opens or a gesture happens, so a
late registration is fine; a key with nothing registered logs once and that
tool stays up. `registerToolBehaviours(extra)` adds behaviours beyond
`BUILT_IN` (a built-in key can't be replaced); production never calls it, it is
how a bench hangs tools of its own on the real mark.

### Adding a tool

The same recipe as `mark-tools.ts`'s header comment:

1. **Behaviour.** Skip if an existing one fits. Otherwise add
   `src/lib/site/mark-tools/<name>.ts` exporting a `ToolBehaviour`, importing
   the interface from `./types` and nothing of the mark's; then one line in
   `BUILT_IN` in `index.ts`. Effects it causes go through their own effect
   layer (the palette's is `palette-dom.ts`). Give it a test beside it, as
   `palette.test.ts` and `palette-revert.test.ts` do.
2. **Icon.** If none fits, add one to `MARK_ICONS`.
3. **Config.** Add an entry to `MARK_TOOLS`. Order is drop order and Tab
   order. Pick a thread no other tool hangs from, and a string and radius that
   keep its hit target clear of its neighbours' (see the limits below).
4. **Run `npm test`.** `mark/tools.test.ts` runs `validateTools` over
   `MARK_TOOLS` against the rig and both registries: unique ids, a thread in
   range on every top-level tool and none on a child, positive `string` and
   `radius`, an icon and a behaviour that exist, a label. The same file holds
   every icon to the two colour classes. `boundary.test.ts` checks the
   imports.

No markup, CSS or mark code changes. If the tool needs a new selector or token,
the plan names it ([workflow.md](workflow.md)).

### Children and the revert

A child hangs from the bottom of its parent's body as drawn (`childPivot`), so
it rides the parent's swing and drag; a tool's swing feels its pivot's
acceleration (`trackPivot` → `stepBauble`), so a carried child trails rather
than hanging rigid. A child hangs only while its parent does
(`visibleTools`).

`shown()` is read on open and again on each `subscribe` callback while open
(subscriptions are held only while open, once per behaviour). A change drops or
reels in that tool alone, with no pull on the threads. The revert is the worked
example: `palette-revert` is a `press` child of `palette`, `shown` while a
non-default palette is stored, subscribed to `onPaletteChange` (so the
palette tool's commits, the palette-picker bench's and other tabs' all reach
it), and `press` commits `null`, which reels it in.

### Open, close, and the tug

Clicking the dot (`.site-mark-hit`) runs the pull → release machine: only the
threads carrying a top-level tool that drops tauten (`tautThreads`), and the
tools drop on the release. When nothing would drop (no tools configured, or none
shown) the click is a **tug** (`isTug` → `lapseTug`): every thread pulls and
lets go. The tools close on a dot click, on Escape, and on any
`site:presentation` change; any drag in progress is cancelled first. Reduced
motion (`--site-mark-motion: 0`, read back from CSS): tools pay out and reel in
at once, and the tug does nothing.

### The boundary test

`src/lib/site/mark/boundary.test.ts` reads imports as text, in both
directions:

- **The mark** (`SuspendedMark.astro`, `MarkTool.astro`, `src/lib/site/mark/*`)
  may import from `mark-tools/` only `index.ts` (the registry) and `types.ts`
  (the interface), and nothing `@site/palette*`, by alias or path.
- **A behaviour** (`src/lib/site/mark-tools/*`) may import nothing under
  `src/lib/site/mark/` and neither mark component. Its whole contract with the
  mark is `types.ts`.

So the mark can't grow a palette special case, and a behaviour can't reach for
the mark's geometry. A behaviour that needs to know where it hangs is asking for
a new hook on `ToolBehaviour`, not an import.

### Accessibility and focus

- **With tools**, `.site-mark-hit` is a button, `aria-label="Tools"`,
  `aria-expanded`, `aria-controls="site-mark-tools"`; the tool group is
  `role="group"`, `aria-label="Tools"`; the overlay drops its `aria-hidden` and
  the threads and dot carry it instead. **With none**, the hit button is
  decorative (`tabindex="-1"`, `aria-hidden`) and so is the whole overlay.
- Each bauble is `role="button"`, `tabindex="0"`, `aria-label` from config,
  `aria-describedby` its `<desc>` when there is a `description`.
- **Hit targets** never drop below `--mark-hit-min` (44px) across, for the dot
  and every bauble, however small either is drawn.
- **Tab order** is dot → tools in `focusOrder` (depth-first, config order).
  That rests on `.site-mark-hit` preceding `.site-mark-overlay` in source order;
  z-index, not source order, puts the button on top. Keep it there.
- **Opened from the keyboard** (a click with `detail === 0`), focus goes to the
  first tool. A focused tool that is hidden while open hands focus to its
  nearest hanging ancestor, else the dot (`focusFallback`); closing with focus
  inside the tools returns it to the dot.
- **Keys on a bauble** go to the behaviour's `key()` first. Enter/Space on a
  `press` bauble presses. Escape cancels a drag in progress wherever focus is
  (a pointer drag doesn't move focus); an Escape nothing takes closes the tools.
  A drag tool's keyboard path is its own, in `key()`: the palette's arrows move
  a virtual pick point, Enter keeps, Escape reverts, and focus leaving mid-pick
  reverts.

## Dither safety

The overlay is a sibling of the page, never an ancestor of anything dithered.
The only transforms are on VT pseudos, on SVG children of the overlay, and, on
the trim close, the WAAPI transform on the live `.page-title` /
`.page-subtitle`, whose contents are text and a link. Nothing dithered sits
under any of them. Anything new that the mark moves has to keep to that
([styling.md](styling.md)).

## The benches

All dev-only, under `src/experiments/` ([workflow.md](workflow.md)). A **new**
experiment route needs `systemctl --user restart astro-preview.service`; edits
to an existing one hot-reload.

- **`/experiments/suspended-dot`**: the tuning bench. A mock home and card with
  the whole motion on it, sharing `mark/geometry.ts` and `mark/motion.ts` with
  production, plus a CSS-exit toggle and the VT path from the slice-2 spike.
  Tune springs and timings here. Its localStorage overrides are the bench's
  own; production never reads them.
- **`/experiments/mark-editor`**: the thread editor, in both poses (in the
  title, and hanging with the letters `HANG_DEPTH` above). It writes the storage
  the suspended-dot bench reads, and prints the rig to paste into
  `src/data/mark-rig.ts`.
- **`/experiments/mark-tools`**: the real `<SuspendedMark tools={PROOF_TOOLS}>`
  (Base's own is off) with no-op tools from `mark-tools-proof.ts`: a press tool
  with a child, a drag tool, and a `shown()` tool toggled from the page,
  registered with `registerToolBehaviours`. Its mode buttons announce
  `site:presentation` as CardStack does, so the hang, the VT exit and the trim
  return can be checked without the stack. Try a new tool's shape here first.
- **`/experiments/palette-picker`**: the palette's dev controls: the colour
  system every pick uses (`palette-system`), the derived-dark toggle, a readout
  and reset, and the picker toys, all through `palette-dom`, so the mark's revert
  and the favicon follow them.

## Known limits

- **WebKit is unverified** for the live overlay through a View Transition and
  for VT types. The headless WebKit available when this was built painted no
  `::view-transition-new` images at all, even on a control page. Types fall back
  to `html[data-vt-type]`. If the live overlay doesn't hold in Safari, the
  planned fallback is to draw the dot only after `vt.finished`, starting from
  the trajectory's end; it is not built. Without View Transitions at all the
  stack announces `vt: null` both ways: going to a card the title is simply
  gone and the dot hangs at once, and coming back is the trim close's live
  return.
- **Hit areas crowd as tools are added.** Every target is at least 44px across,
  and the rig has five threads close together. The revert's string went from 28
  to 34 because at 28 the two targets overlapped by 4px and the revert, drawn on
  top, took presses meant for the palette; at 34 the centres are 46px apart.
  Check a new tool's dropped position against every neighbour's target, children
  included; nothing tests for it.
- **A lens deep link** (`/lens/x?from=…`) shows page chrome until the stack
  restores its fan (the stack's, not the mark's), so for that moment the
  title's real period and the hanging dot are both on screen.
- **ThemeToggle is not a tool yet.** It stays in the footer; making it the
  second tool needs a `theme` behaviour, an icon and a config entry.
