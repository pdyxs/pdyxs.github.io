# The suspended mark — build plan

Takes `/experiments/suspended-dot` to production: the full stop in `pdyxs.wtf`
hangs from five threads; when the page header leaves, the title rises, grows
and drifts to centre while the dot stops at the top edge and hangs there;
clicking the dot pulls the threads taut and drops global tools. The favicon is
the same rig.

The experiment stays as the tuning bench (dev-only, as now), and so does
`/experiments/mark-editor`. Production code must not read their localStorage
overrides.

## Decisions

- **The card header grows out of the rule.** The horizontal line under the
  title and subtitle is what morphs into the new card's header. The title and
  subtitle are free to leave upwards on their own.
- **The dot hangs at the viewport's horizontal centre**, at every breakpoint.
- **The mark is on every page.** Where the page shows a title (any page-mode
  lens), the dot is the title's full stop. Everywhere else (card mode, cold
  loads of `/card/...`, pages without a stack) it hangs at the top of the
  screen from the start.
- **The mark ships first, with no tools.** Clicking the dot pulls the threads
  taut and nothing drops yet.
- **The palette is the first tool**, and so far the only one. While a
  non-default palette is set, a second, smaller circle with an ×, the
  **revert**, hangs from the palette bauble.
- **ThemeToggle stays in the footer.** It becomes the second tool after the
  palette tool lands.
- **Tool config is data, and tool behaviour is separate from the mark.** See
  [Tools](#tools).

---

## What the experiment fakes that production can't

1. **The card open is simulated.** The experiment animates the header in the
   live DOM and reads the slot's rect every frame. On the real site, page → card
   is a View Transition in `CardStack.svelte` (`performPush`,
   `wasHomePageMode`). During the VT the old title exists only as a snapshot,
   and nothing can read its rect.
2. **The title is always on screen at load.** A cold load in card mode has no
   title to measure, and the dot must start out hanging.
3. **Only home is page mode.** The push path special-cases `HOME_UID`, but
   other lenses can be page mode too and also carry the title.

## The mark

### Modules

| file | what | layer |
|---|---|---|
| `src/data/mark-rig.ts` | the five threads (exists) | data |
| `src/lib/site/mark/geometry.ts` | `poseThreads`, `tauten`, `toolPivot`, bauble physics (moved from `mark-geometry.ts`) | pure |
| `src/lib/site/mark/motion.ts` | `step` spring, the catch/settle at the edge, the pull → release → rest phase machine (and `lapseTug`, the pull with no tools), `poseBlend`, `titleExit` | pure |
| `src/lib/site/mark/measure.ts` | the full stop's ink box from a canvas pixel scan, in em; the plausibility check and Chromium-measured fallback; the dot within the slot | pure |
| `src/lib/site/presentation-event.ts` | `site:presentation`: its detail type, `announcePresentation`, `currentPresentation` (reads `html[data-presentation]`) | shared |
| `src/components/site/SuspendedMark.astro` | `<site-mark>` custom element: overlay SVG, hit button, rAF loop, SVG writes. Takes an optional `tools` prop (default `MARK_TOOLS`) | effect |
| `src/components/site/MarkTool.astro` | slice 7: one tool's markup from its config (string, bauble, icon), children nested, recursive | markup |
| `src/lib/site/mark/tools.ts` | slice 7: the generic tool decisions: `flattenTools`, `visibleTools`, `isTug`, `tautThreads`, `toolLength`, `childPivot`, `focusOrder`, `focusFallback`, `validateTools` | pure |

The mark knows threads, the dot, the pull, and that baubles hang from
pivots. It does not know what any tool does. See [Tools](#tools).

### The exit is a known trajectory, not a measured one

`titleExit(start, viewport, t) → { title: {slot, scale}, subtitle: {offset} }`
is the header's departure as a function of time. It covers the rise by header
height, the drift to the centre line, the title's growth about its slot (the
subtitle rises and drifts but doesn't grow), and the experiment's easings
(`cubic-bezier(0.5,0,0.75,0)` out, `(0.25,1,0.5,1)` back). That one function
drives both:

- **the snapshots**: WAAPI keyframes on `::view-transition-old(page-title)` and
  `::view-transition-old(page-subtitle)`, sampled from `titleExit`.
- **the dot and threads**: each frame samples `titleExit` at the VT's elapsed
  time in place of `slot.getBoundingClientRect()`.

The return trip runs the same function backwards on the `-new` pseudos.

### The rule becomes the card header

Right now the line under the subtitle is `.page-header`'s `border-bottom`, and
`home-divider` morphs the whole `.page-header` box into `.card-header`. That
morph starts from a tall box, not from the line.

The change: the line becomes its own element, `.page-header-rule`. It takes
over the border, so the page looks identical at rest. That needs a check
against `site-footer.css`, which matches `.page-header`'s box. The rule is
named `page-rule` and morphs into `.card-header`. Since the old box is the
line's box, the default group animation already grows the header out of it.
The title and subtitle carry their own names, so they are cut out of every
other snapshot and leave on their own.

### The overlay renders live through the VT

The overlay gets `view-transition-name: site-mark`, set by the mark just before
the VT and cleared on `finished`, per the stack-state.md naming rules. That
comes with `::view-transition-old(site-mark) { display: none }` and
`::view-transition-new(site-mark) { animation: none }`. The new-state pseudo
renders live, so the rAF-drawn dot keeps moving over the frozen root. **Spike
this first** (slice 2). If it doesn't hold in Chromium and Safari, the
fallback is to draw the dot only after `vt.finished`, starting from the
trajectory's end.

### CardStack announces, the mark listens

CardStack keeps owning the push and the VT. It gains one effect: a document
event, `site:presentation`, with
`{ to: 'page' | 'card', vt: ViewTransition | null }`. On both page↔card VT
paths it fires right **after** `startViewTransition` returns (it needs the
transition object), which is still before the old state is captured: the
browser captures at its next rendering opportunity, and only then runs the
update. It fires once on mount with `vt: null` for the cold-load mode, and
with `vt: null` for every change that has no VT. (Slice 4 brought the event
forward as a thin `$effect`; slice 5 has the VT paths announce for themselves
and the effect drop a repeat of the last value announced, so each change is
announced exactly once.) Each announcement is
also written to `html[data-presentation]`, so a listener whose script runs
after the first event reads the last value at startup. The page → card path is generalised from
`wasHomePageMode` to "the sole entry is page mode", which covers question 3
above. The mark reads title geometry before the VT starts, names the title
and subtitle itself, and animates only VT pseudos on `document.documentElement`.
It never writes to `#card-stack`: the names come from a rule in
`SuspendedMark.astro` gated on `html[data-mark-vt]`, which the mark sets on the
announcement and removes on `finished` (slice 5: a selector names the
returning title in the NEW state, which the mark has no hook into CardStack's
update callback to do from script). Returning, the dot follows `titleExit`'s
offset from the **live** slot, because the browser keeps placing a new-side
snapshot on its element and the stack may still be moving the page card.

**Not every page↔card change is a VT** (slice 3 found this). The usual close,
back onto a home already in the stack (`?from=0` → `/`), only trims the stack
and lets the stack's own motion bring home back to page mode. That path
announces `{ to: 'page', vt: null }`, and in response the mark runs
`titleExit` in `'return'` on the **live** title and subtitle with WAAPI
(`element.animate`, transforms only; nothing in the header is dithered). The
dot reads the live slot, as the experiment's CSS path does. The stack's own
motion is left alone. Decided 2026-10-20: option (a), over adding a VT to the
trim close.

### Markup

- The site title renders its full stop as
  `<span class="page-title-mark">.</span>` in `LensStackCard.astro`. It is a
  real period until the mark is drawn:
  `html[data-mark-ready] .page-title-mark { color: transparent }`. Without JS,
  the title is just text.
- `<SuspendedMark />` is mounted once, in `Base.astro`, outside `#card-stack`.
- At rest in the title, the overlay switches to document positioning
  (`data-mode="page"` + `data-overlay="doc"`), as the experiment does, so
  scroll never trails.

### No title on the page

**Built (slice 6).** The overlay is mounted first in `<body>`, so it is parsed
before the page under it (the browser paints a partly parsed document, and at
the end of a long card the mark arrived frames after the first paint).

- **The hang's size has one source:** `--mark-hang-em` and `--mark-hang-size`
  in `tokens.css`. The em is the page title's font-size (`--page-title-size`,
  which `.page-title` now uses) × 3, the exit's growth; the dot is that em ×
  0.095, the full stop's ink width. `TITLE_EXIT_SCALE` (motion.ts) and
  `HANG_DOT_INK` (mark/hang.ts) are the same two factors as numbers, pinned to
  the CSS by `hang.test.ts`. The script never computes the hang: it reads both
  tokens back, resolved, off `.site-mark-hang-probe`.
- **The hang pose needs no title.** The rig's hang control points are em
  offsets from the attach points; the anchors, on letters that have left, sit
  `HANG_DEPTH` (0.6) em above the dot, the separation the pose was authored at
  in the mark editor. So the pose is the dot's centre plus em × fixed numbers
  (`hangPose`, `hangMarkup` in `src/lib/site/mark/hang.ts`).
- **The server draws it.** `.site-mark-hang` is a second SVG, the pose laid out
  at build time in 1/1000 em about the dot's centre (viewBox), which CSS sizes
  by `--mark-hang-em` and pins at the top-centre. Threads included: the stroke
  is `vector-effect: non-scaling-stroke` at the script's width
  (`max(1.2px, 0.012em)`). It shows on `html[data-cold-presentation='card']`
  until `html[data-mark-ready]`, and without JS for good. The script's first
  draw, in the same task as `data-mark-ready`, is the same picture (measured:
  no pixel differs by more than half; the SSR copy sits ~0.16px right, where
  Chromium snaps the SVG's box).
- **Page or card before paint** is `html[data-cold-presentation]`: seeded by
  the route (Base's `presentation`, `page` from LensPage via
  `presentationMode('lens', 1)`), turned `card` by the stack's pre-paint script
  when the URL carries `from`/`to` (`presentationMode('lens', 2)` at build
  time). With no announcement yet, the mark starts from it; that is what makes
  a page with no stack hang. A first announcement that differs from the seed is
  a correction, not a return: a lens deep link announces `page` on mount before
  restoring its fan, and no title comes back down for it.
- **After an exit it is the same hang.** Card mode always hangs from the hang's
  own slot (`slotSource` → `hang`, no title needed). The exit lands on it: the
  dot's size and em ease from the title's grown ones onto the hang's as the
  growth completes (`grownDot`, nothing in Chromium), and the anchors move from
  the letters to `HANG_DEPTH` as the pose blends (`anchorSlot`), when the
  letters are already off the screen. `hangFrame` and `data-hang` are retired.
- **Known:** a lens deep link (`/lens/x?from=…`) still shows page chrome until
  the stack restores its fan (the stack's, not the mark's), so for that moment
  the title's real period and the hanging dot are both on screen.

---

## Tools

Three parts. Each one can change without the other two.

### 1. Config: `src/data/mark-tools.ts`, hand-edited

```ts
export const MARK_TOOLS: ToolConfig[] = [
  {
    id: 'palette',
    behaviour: 'palette',          // key into the behaviour registry
    thread: 1,                     // hangs from MARK_RIG.threads[1]
    string: 80,                    // px when dropped
    radius: 12,                    // body circle; the hit target never drops below --mark-hit-min
    icon: 'palette',               // key into MARK_ICONS
    label: 'Colours: drag across the page to pick them',
    children: [
      {
        id: 'palette-revert',
        behaviour: 'palette-revert',
        string: 28,                // hangs from the palette bauble
        radius: 8,
        icon: 'cross',
        label: 'Revert colours',
      },
    ],
  },
];
```

A top-level tool hangs from a thread. A child hangs from its parent's bauble.
The physics is the same either way: a moving pivot is already how
`toolPivot` → `stepBauble` works. Every string length, size, icon and order
is here, and nowhere else.

### 2. Icons: `src/data/mark-icons.ts`

Small SVG bodies keyed by name. Each is drawn in a unit box and scaled to the
bauble's radius. The fill and stroke take the two palette colours through
classes (`.site-mark-icon-ink` / `-paper`), never literal colours. `palette`
is the experiment's ring-and-core; `cross` is the ×.

### 3. Behaviour: `src/lib/site/mark-tools/`

One file per behaviour, each implementing the interface the mark calls:

```ts
export interface ToolBehaviour {
  /** Drag (the palette) or press (revert). Decides the pointer wiring the mark sets up. */
  kind: 'drag' | 'press';
  /** Whether the bauble should be hanging right now; the mark drops/reels it on change. */
  shown?(): boolean;
  /** Tell the mark when `shown()` may have changed. Returns an unsubscribe. */
  subscribe?(changed: () => void): () => void;
  press?(): void;
  dragStart?(p: ViewportPoint): void;
  dragMove?(p: ViewportPoint): void;
  dragEnd?(p: ViewportPoint, cancelled: boolean): void;
  /** Keyboard: arrows nudge, Enter commits, Escape cancels (drag tools). */
  key?(e: KeyboardEvent): boolean;
}
```

- `palette.ts`: pick on move, commit on end, revert on cancel. It uses
  `palette-dom.ts` and emits `changed` on commit.
- `palette-revert.ts`: `shown = palette is not default`, and `press`
  clears it.
- `index.ts`: the registry `{ palette, 'palette-revert' }`. Adding a tool
  means adding a file and a registry line, then a config entry.

**As built (slice 7).** `index.ts` exports `BUILT_IN` (the production
behaviours; the palette from slice 8), `toolBehaviour(key)` (what the mark calls)
and `registerToolBehaviours(extra)`, which production never calls: it lets a
dev bench hang behaviours of its own on the real registry without shipping
them (`/experiments/mark-tools` registers its no-ops from its page script). A
built-in key can't be replaced. The mark looks a behaviour up each time it
opens or a gesture happens, so a late registration is fine.

The mark side, generically:

- **Open/close** is the pull → release machine. Only the threads carrying a
  top-level tool that drops (or, closing, that is out) tauten
  (`tautThreads`). When nothing would drop (no tools, or none shown) the click
  is the slice-4 tug (`isTug` → `lapseTug`, every thread). Reduced motion:
  the tools pay out and reel in at once; the tug still does nothing.
- **Where it hangs:** a top-level tool from `toolPivot` on its (tautened)
  thread; a child from the bottom of its parent's body as drawn
  (`childPivot`), so it rides the parent's swing and drag. A child hangs only
  while its parent does (`visibleTools`).
- **`shown()`** is read on open and again on each `subscribe` callback while
  open (subscriptions are held only while open). A change drops or reels in
  that tool alone, with no pull.
- **Pointer:** every bauble gets the same listeners; `kind` decides at event
  time. Press: `click` → `press()`. Drag: pointer capture, the bauble follows
  the pointer (`baubleAt`), `dragStart/Move/End`; pointercancel or Escape
  (wherever focus is) cancels; let go, it swings back on its string.
- **Keys:** Enter/Space on a press bauble presses; a bauble's keydown goes to
  `key()` first, and Escape it doesn't take closes the tools.
- **Closing:** a dot click, Escape, or any `site:presentation` change; any
  drag is cancelled, and focus inside the tools returns to the dot.
- **Focus:** opened from the keyboard (a click with no pointer detail), focus
  goes to the first tool in `focusOrder` (depth-first, config order). A
  focused tool that is hidden while open hands focus to its nearest hanging
  ancestor, else the dot (`focusFallback`).
- **Config checks:** `mark/tools.test.ts` runs `validateTools` (unique ids,
  thread in range on top-level tools and absent on children, positive sizes,
  icon and behaviour keys that exist) over `MARK_TOOLS` against `BUILT_IN`,
  and over the bench's config against `BUILT_IN` plus its own behaviours.

The mark imports the config and the registry, and nothing palette-specific.
A small boundary test (`mark/boundary.test.ts`) enforces this. It reads the
imports of `SuspendedMark.astro`, `MarkTool.astro` and `src/lib/site/mark/*`
and fails on anything under `mark-tools/` other than `index.ts` and
`types.ts`, and on any `@site/palette*` import. The other direction too: no
file under `mark-tools/` may import anything under `src/lib/site/mark/` or
either mark component; a behaviour's whole contract is `types.ts`.

### Palette effect layer: `src/lib/site/palette-dom.ts`

`applyPalette`, `commitPalette` and `renderFavicon` move here from
`PalettePicker.astro` and the experiment, where each currently has its own
copy. `palette.ts` stays pure. The favicon re-renders on commit and on theme
change, not from a MutationObserver on `<html style>`.

**As built (slice 8).** The API:

| export | what |
|---|---|
| `applyPalette(p \| null)` | writes (or removes) the four `--color-{light,dark}-{srgb,p3}` on `<html>`; a preview, nothing stored or announced |
| `commitPalette(p \| null, point?)` | stores it (a default palette removes the `palette` key), applies it, re-renders the favicon, announces it; returns what was kept |
| `onPaletteChange(fn)` → unsubscribe | the change signal: `{ palette, point }` on every commit and on another tab's (`storage`); `point` is the pick's viewport fractions when it came from one. Previews don't fire it |
| `storedPalette()`, `currentSystem()`, `storeSystem(id)`, `PALETTE_SYSTEM_KEY` | storage reads/writes (`palette`, `palette-system`), every access try/caught |
| `toFraction(clientPt)`, `pickAt(clientPt)`, `pickPoint(fractions)`, `pointFor(p \| null)` | picking in the current system; `pointFor` is the inverse, through the new pure `locate(system, palette)` in `palette.ts` (a grid search refined in OKLab; the default palette is the top-left corner) |
| `faviconSvg(source, ink, paper)`, `renderFavicon()` | the favicon: `public/favicon.svg` with an appended `<style>` overriding `#paper` fill and `#dot` fill / `#threads path`, `#frame` stroke (`!important` beats the file's inline styles), from `body`'s computed `color` and `background-color`; `renderFavicon` points `link[rel=icon]` at it as a data URI |
| `watchPalette()` | once per page, from a module script in `Base.astro`: other tabs' picks (`storage`), the favicon on `site:theme`, and the favicon at load when the page isn't the file's own black on white (a stored palette, or dark) |

The theme-change signal didn't exist: `data-theme` was set silently in three
places. It is now `site:theme` on `document` (`THEME_CHANGE_EVENT` in
`theme.ts`, detail `{ theme }`), fired by ThemeToggle's click and its OS
listener and by Base's head-script OS listener. They are inline, so they spell
the name out; `theme.test.ts` holds them to the constant.

The experiment's override named `.paper`/`.ink`/`.thread`/`.frame`, which the
hand-simplified `favicon.svg` (1714bec) no longer has, so it recoloured
nothing; the override now names the file's ids, and `palette-dom.test.ts`
checks the file still has them.

**The two pickers** share everything through palette-dom. PalettePicker
subscribes to `onPaletteChange` for its reset button, readout and the point
its dev system `<select>` re-picks, so a pick or reset from either side is
reflected on the other; its own `storage` listener went (palette-dom has it).

**The palette behaviour** (`mark-tools/palette.ts`): `dragStart` snapshots
`storedPalette()`, `dragMove` applies `pickAt`, `dragEnd` commits (with the
point) or, cancelled, applies the snapshot. The keyboard, in `key()` on the
focused bauble: an arrow starts a pick at `pointFor(stored)`, so the first
press nudges the current palette rather than jumping, then moves the virtual
point by 1% of the viewport (Shift: 10%), clamped to it, applying live. Enter
commits and ends the pick; Escape mid-pick reverts and returns true (the tools
stay open); Enter and Escape with no pick return false, so Escape closes the
tools. Focus leaving the bauble mid-pick (Tab away, a dot click, the tools
closing) reverts too: an unkept pick never outlives the bauble. Arrows during
a pointer drag are swallowed; a pointer drag takes over a keyboard pick and
keeps the keyboard's snapshot. The keyboard path is the bauble's accessible
description: `ToolConfig` gained an optional `description`, which
`MarkTool.astro` renders as an SVG `<desc>` the bauble's `aria-describedby`
names. The label stays the experiment's.

---

## Contract (selectors and CSS variables)

New selectors:

| selector | what |
|---|---|
| `site-mark` | the custom element, root of everything below |
| `.site-mark-overlay` | fixed full-viewport SVG |
| `.site-mark-threads` (5 × `path`) | the threads |
| `.site-mark-dot` | the dot (`rect`) |
| `.site-mark-hit` | the tools button, `aria-label="Tools"`, `aria-expanded`, `aria-controls="site-mark-tools"`, when at least one tool is configured (slice 7). With none it stays decorative: `tabindex="-1"`, `aria-hidden` |
| `.site-mark-probe`, `.site-mark-probe-text`, `.site-mark-probe-base` | a hidden full stop laid out in the title's font, whose empty inline-block gives the engine's own baseline (measure.ts) |
| `.site-mark-hang` (5 × `path` in `.site-mark-threads`, `rect.site-mark-dot`) | slice 6: the hanging pose as the server draws it, for the first paint in card mode |
| `.site-mark-hang-probe` | slice 6: resolves `--mark-hang-size` (width) and `--mark-hang-em` (height) to px for the script |
| `.site-mark-tools` | the tool group: `#site-mark-tools`, `role="group"`, `aria-label="Tools"`. Rendered only when tools are configured; then the overlay drops its `aria-hidden` and the threads and dot carry it instead |
| `.site-mark-tool[data-tool]` | one tool (children are nested `.site-mark-tool`s). Also `data-behaviour`, `data-thread` (top-level), `data-parent` (children), `data-string`, `data-radius`: the config, written by `MarkTool.astro`, read by the script |
| `.site-mark-tool-string`, `.site-mark-bauble`, `.site-mark-bauble-hit`, `.site-mark-bauble-body` | tool parts. The bauble is `role="button"`, `tabindex="0"`, `aria-label` from config; the hit circle is never under `--mark-hit-min` across |
| `.site-mark-tool-desc` | slice 8: `<desc id="site-mark-tool-desc-{id}">` in the bauble, from the optional config `description`; the bauble's `aria-describedby` |
| `.site-mark-icon` | slice 7: the icon's group in the bauble, `scale(radius)` of the unit-box body from `MARK_ICONS` |
| `.site-mark-icon-ink`, `.site-mark-icon-paper` | icon colouring (fills only) |
| `.page-title-mark` | the period's slot in the title |
| `.page-header-rule` | the line under the subtitle (replaces `.page-header`'s border-bottom) |

State attributes: `site-mark[data-mode="page"|"card"]`,
`site-mark[data-overlay="doc"]`, (`site-mark[data-hang]`, slice 5, is retired
in slice 6: card mode always hangs),
`html[data-cold-presentation="page"|"card"]` (slice 6: the presentation the
page loads in, before paint; Base seeds it from the route and the stack's
pre-paint script turns it `card` for a `from`/`to` fan),
`html[data-mark-vt="title"|"mark"]` (slice 5: for the length of a page ↔ card
VT, names the overlay and, for `title`, the page-mode title and subtitle;
`mark` is reduced motion, the overlay only), `.site-mark-tool[data-open]`,
`.site-mark-bauble[data-dragging]`, `.site-mark-bauble[data-kind="drag"|"press"]`
(slice 7: the behaviour's kind, set when it drops; the cursor), `html[data-mark-ready]`,
`html[data-presentation="page"|"card"]` (the last `site:presentation`, written
by `announcePresentation`). `html[data-mark-ready]` now also retires the
server's hanging pose.

View-transition names:

- **new:** `site-mark`, `page-title`, `page-subtitle`, `page-rule`. The
  overlay, title and subtitle names are the mark's (through
  `html[data-mark-vt]`, not `element.style`); `page-rule` is set by
  CardStack. Their pseudo rules are in `SuspendedMark.astro`, not
  `layout.css`.
- **types** (slice 3): `page-to-card` and `card-to-page` on the page ↔ card
  transitions, so CSS can tell which side of `page-rule` is the card header.
  Fallback marker where types are unsupported: `html[data-vt-type]`.
- **retired:** `home-title` and `home-divider`, along with their
  `::view-transition-group` rules in `layout.css`.

Event: `site:presentation` on `document`, detail
`{ to: 'page' | 'card', vt: ViewTransition | null }` (`PresentationDetail`).

Event (slice 8): `site:theme` on `document`, detail `{ theme: 'light' | 'dark' }`
(`THEME_CHANGE_EVENT`, `ThemeChangeDetail` in `theme.ts`), after every
`html[data-theme]` change.

Slice 8 also writes `link[rel="icon"]`'s `href` (a data URI of the recoloured
`favicon.svg`) and adds no selectors beyond `.site-mark-tool-desc`, no custom
properties and no `:root` tokens: the palette's own four
`--color-{light,dark}-{srgb,p3}` on `<html>` are unchanged.

A local custom property (slice 3), set on `.stack-card--page > .page-header`
from the spacing tokens, the way `--body-inset-inline` is:

- `--page-header-inset-inline`: the header's inline padding (`0px` mobile,
  `--space-md` desktop), which `.page-header-rule` cancels with negative
  margins so the line spans the box the border used to.

Local custom properties (slice 4), in `SuspendedMark.astro`:

- `--site-mark-x`, `--site-mark-y`, `--site-mark-size` on `.site-mark-hit`:
  the dot's centre (in the overlay's coordinates) and size, written by the
  script; `--site-mark-hit-size` is derived from them and `--mark-hit-min`
  in CSS.
- `--site-mark-motion` on `site-mark`: `1`, or `0` under
  `prefers-reduced-motion`, read back by the script (the tug doesn't run).

Local custom property (slice 7), inline on `.site-mark-bauble` from
`MarkTool.astro`: `--site-mark-tool-r`, the configured radius in px, which the
hit circle's `r` takes the max of with half of `--mark-hit-min`. Slice 7 adds
no `:root` tokens.

Local custom properties (slice 6), inline on `.site-mark-hang` from the
build: `--hang-x`, `--hang-y`, `--hang-w`, `--hang-h` (its box, em, about the
dot's centre), `--hang-top` (`HANG_Y`), `--hang-stroke-em`, `--hang-stroke-min`.

New `:root` custom properties (`tokens.css`):

- `--page-title-size` (slice 6): `.page-title`'s font-size,
  `clamp(2rem, 5vw, 3rem)`, so the hang can be sized from it with no title
- `--mark-hang-em` (slice 6): the hanging rig's em,
  `--page-title-size × 3` (`TITLE_EXIT_SCALE`)
- `--mark-hang-size`: the dot's size when hanging, `--mark-hang-em × 0.095`
  (`HANG_DOT_INK`)
- `--mark-hit-min: 44px`: the minimum hit target, for the dot and baubles
- `--z-mark: 900`: the overlay; the hit button is `calc(var(--z-mark) + 1)`

Motion constants (spring k/ζ, durations, `PULLED`, `DROP`/`REEL`) are TS
constants in `mark/motion.ts`. Per-tool numbers live in `mark-tools.ts`.

Dither check: the only transforms are on VT pseudos, on SVG children of
the overlay, and (slice 5, the trim close) a WAAPI transform on the live
`.page-title` and `.page-subtitle`, whose contents are text and a link.
Nothing dithered sits under any of them.

---

## Slices

Each slice ships green.

**The mark**

1. **Pure motion.** Move `mark-geometry.ts` to `mark/geometry.ts`. Extract
   `step`, the catch/settle, the phase machine and `poseBlend` into
   `mark/motion.ts`, add `titleExit`, and unit-test them. Rewire the
   experiment onto it, so the bench and prod share the code. No visible
   change.
2. **VT spike.** Swap the experiment's margin animation for a real
   `startViewTransition` with the live `site-mark` overlay, `titleExit`
   keyframes and a rule element growing into a mock card header. Check it in
   Chromium and Safari, and settle the fallback here.
3. **The rule.** Add `.page-header-rule`, take the border off `.page-header`
   with no visual change, and switch the page → card morph to `page-rule` →
   `.card-header`. For now the title still crossfades. Retire `home-divider`.
4. **Mark in the title.** `<SuspendedMark />` in Base and the
   `.page-title-mark` slot. Threads are drawn at rest in page mode, and the
   click pulls them taut. No tools yet.
5. **The exit.** CardStack emits `site:presentation` and the page-mode check
   is generalised. The mark takes the title and subtitle off with `titleExit`,
   the dot is caught at the top edge, and close reverses it. Island tests for
   the event (`CardStack.island.test.ts`). Retire `home-title`.
6. **Hanging without a title.** SSR the card-mode pose for cold loads and
   pages with no stack, with no flash and no jump at hydration. `/verify` on
   `/`, `/card/...` and `?from=`.

**The tools**

7. **Tool framework.** `mark-tools.ts`, `mark-icons.ts`, the `ToolBehaviour`
   interface and registry, and the mark drawing tools generically, children
   included. The import-closure test goes in here. Prove it with a no-op
   `press` tool in the experiment only. **Built:** the proof is
   `/experiments/mark-tools` (config and behaviours in
   `src/experiments/mark-tools-proof.ts`): a press tool with a child, a drag
   tool, and a `shown()` tool toggled from the page, on the real
   `<SuspendedMark tools={…}>` (Base's own mark is off there). The mode buttons
   announce `site:presentation` as CardStack does, so the hang, the VT exit and
   the trim return are on the bench too.
8. **Palette tool.** Add `palette-dom.ts` (shared with `PalettePicker`), the
   `palette` behaviour and keyboard picking. **Built:** see "As built (slice 8)"
   under [Palette effect layer](#palette-effect-layer-srclibsitepalette-domts).
   The floating picker stays mounted alongside until slice 10.
9. **Revert.** Add the `palette-revert` child behaviour, which drops when a
   palette is set and reels up when one is cleared.
10. **Retire the floating picker.** Remove `<PalettePicker />` from Base. Its
    dev system/derive controls stay on `/experiments/palette-picker`.
11. **Docs.** Add a mark section to `card-rendering.md`, covering tools, how to
    add one, and the config file. Update the VT-names list in
    `stack-state.md`, and add the selectors above to the stable selector
    contract in `stack-layout.md`.

Later: ThemeToggle as the second tool, which needs a `theme` behaviour, an
icon and a config entry.
