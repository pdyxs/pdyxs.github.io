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
| `src/components/site/SuspendedMark.astro` | `<site-mark>` custom element: overlay SVG, hit button, rAF loop, SVG writes | effect |

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
`{ to: 'page' | 'card', vt: ViewTransition | null }`. It fires just before
`startViewTransition` on both page↔card paths, and once on mount with
`vt: null` for the cold-load mode. (Slice 4 brought the event forward: a thin
`$effect` after the layout effect announces the active entry's presentation on
mount and on every change, always with `vt: null`. Slice 5 moves the page↔card
announcements to just before the VT and fills in `vt`.) Each announcement is
also written to `html[data-presentation]`, so a listener whose script runs
after the first event reads the last value at startup. The page → card path is generalised from
`wasHomePageMode` to "the sole entry is page mode", which covers question 3
above. The mark reads title geometry before the VT starts, names the title
and subtitle itself, and animates only VT pseudos on `document.documentElement`.
It never writes to `#card-stack`.

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

The overlay is SSR'd with `data-mode="card"` unless the page seeds page-mode
chrome. In card mode, CSS alone places the dot hanging at top-centre at
`--mark-hang-size`, before hydration. The threads are added at hydration in
the `p = 1` pose. The hang pose is authored relative to the attach point, so
it needs no title. `em` is derived from the hang size, so nothing has to be
measured.

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

The mark imports the config and the registry, and nothing palette-specific.
A small boundary test (`mark/boundary.test.ts`) enforces this. It reads the
imports of `SuspendedMark.astro` and `src/lib/site/mark/*` and fails on
anything under `mark-tools/` other than `index.ts`, and on any `@site/palette*`
import.

### Palette effect layer: `src/lib/site/palette-dom.ts`

`applyPalette`, `commitPalette` and `renderFavicon` move here from
`PalettePicker.astro` and the experiment, where each currently has its own
copy. `palette.ts` stays pure. The favicon re-renders on commit and on theme
change, not from a MutationObserver on `<html style>`.

---

## Contract (selectors and CSS variables)

New selectors:

| selector | what |
|---|---|
| `site-mark` | the custom element, root of everything below |
| `.site-mark-overlay` | fixed full-viewport SVG |
| `.site-mark-threads` (5 × `path`) | the threads |
| `.site-mark-dot` | the dot (`rect`) |
| `.site-mark-hit` | the tools button, `aria-expanded`, `aria-controls` → tools (until slice 7, decorative: `tabindex="-1"`, `aria-hidden`) |
| `.site-mark-probe`, `.site-mark-probe-text`, `.site-mark-probe-base` | a hidden full stop laid out in the title's font, whose empty inline-block gives the engine's own baseline (measure.ts) |
| `.site-mark-tools` | the tool group |
| `.site-mark-tool[data-tool]` | one tool (children are nested `.site-mark-tool`s) |
| `.site-mark-tool-string`, `.site-mark-bauble`, `.site-mark-bauble-hit`, `.site-mark-bauble-body` | tool parts |
| `.site-mark-icon-ink`, `.site-mark-icon-paper` | icon colouring |
| `.page-title-mark` | the period's slot in the title |
| `.page-header-rule` | the line under the subtitle (replaces `.page-header`'s border-bottom) |

State attributes: `site-mark[data-mode="page"|"card"]`,
`site-mark[data-overlay="doc"]`, `.site-mark-tool[data-open]`,
`.site-mark-bauble[data-dragging]`, `html[data-mark-ready]`,
`html[data-presentation="page"|"card"]` (the last `site:presentation`, written
by `announcePresentation`).

View-transition names:

- **new:** `site-mark`, `page-title`, `page-subtitle`, `page-rule`. The
  title and subtitle names are set by the mark; `page-rule` is set by
  CardStack.
- **types** (slice 3): `page-to-card` and `card-to-page` on the page ↔ card
  transitions, so CSS can tell which side of `page-rule` is the card header.
  Fallback marker where types are unsupported: `html[data-vt-type]`.
- **retired:** `home-title` and `home-divider`, along with their
  `::view-transition-group` rules in `layout.css`.

Event: `site:presentation` on `document`, detail
`{ to: 'page' | 'card', vt: ViewTransition | null }` (`PresentationDetail`).

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

New `:root` custom properties (`tokens.css`):

- `--mark-hang-size`: the dot's size when hanging (the experiment's ×3.00 of
  title size, resolved to a length)
- `--mark-hit-min: 44px`: the minimum hit target, for the dot and baubles
- `--z-mark: 900`: the overlay; the hit button is `calc(var(--z-mark) + 1)`

Motion constants (spring k/ζ, durations, `PULLED`, `DROP`/`REEL`) are TS
constants in `mark/motion.ts`. Per-tool numbers live in `mark-tools.ts`.

Dither check: the only transforms are on VT pseudos and on SVG children of
the overlay. Nothing dithered sits under either.

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
   `press` tool in the experiment only.
8. **Palette tool.** Add `palette-dom.ts` (shared with `PalettePicker`), the
   `palette` behaviour and keyboard picking.
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
