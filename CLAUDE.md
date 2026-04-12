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

## Architecture

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

This pattern is mandatory for any card renderer that needs animated expand/collapse. The `open` class is managed by `expandCard`/`collapseCard` in StackNav, except during View Transitions (where the body opens after `vt.finished`).

### View Transition names

Never set `view-transition-name` in HTML — it causes conflicts when multiple elements share a name on screen simultaneously. Always:

1. Inject via JS (`element.style.viewTransitionName = '...'`) immediately before `startViewTransition()`
2. Clear after `vt.finished` (`element.style.viewTransitionName = ''`)
3. Use distinct names per direction: `panel-card-open` (link → card) and `panel-card-close` (card → link)

Setting a name on a detached node before appending it inside the `startViewTransition()` callback works correctly — the VT captures the name from the post-callback DOM state.

Clearing is mandatory, not advisory — leaving a name set after the transition will collide with the next one. Instant-fallback paths (when VT is unsupported or skipped) must not depend on the VT to open the body; the `.open` class transition handles that independently.

## Invariants

These are load-bearing. Plans and experiments must respect them; violating any of them is a refactor, not a local change.

### StackNav owns all card-stack mutations

Any code that pushes, collapses, expands, reorders, or hides cards goes through `src/components/StackNav.astro`. Renderers and other scripts must not reach into `#card-stack` directly. This keeps the VT lifecycle, state classes, and layout updates in one place.

### Class-based card state is the single source of truth

`stack-card--active` and `stack-card--collapsed` define a card's state. `.body-wrapper.open` is derived from that state, not tracked in parallel. Never duplicate card state in JS variables, `dataset`, or additional classes.

### Stable selector contract

These class names are a JS API, not styling hooks — renaming any of them is a StackNav refactor, not a CSS change:

- `#card-stack`
- `.stack-card`, `.stack-card--active`, `.stack-card--collapsed`
- `.card-header`
- `.body-wrapper`, `.body-wrapper.open`
- `.stack-card-body`, `.stack-card-body-inner`

### `data-uid` format is `collection/id`

It's the round-trip key between DOM and `/card/...` fetches. Don't improvise the format at call sites.

### One stack mutation = one layout update

Any function that changes which cards exist or which is active calls the single layout updater (`updateStackLayout()` once added) at the end. Don't let callers piecemeal-update `--stack-index`, overflow state, or similar.

### Pure logic must be extractable from DOM handlers

Functions that decide *what* should happen (which cards hide, what `--stack-index` each gets, which renderer handles a collection) take plain data as input and return plain data. A thin DOM applier writes the result. This is the contract that makes the logic testable — mixing reads, decisions, and writes in the same function is a bug, not a style choice.

## Conventions

### All semantic colors and spacing go through CSS custom properties

No hex literals or raw pixel values outside `:root` for anything that represents a design token (colors, spacing, radii, breakpoints). Dark-mode support and future theming depend on this.

### Renderer registration is mandatory

Any new content collection must appear in `COLLECTION_DEFAULTS` (`src/lib/cards.ts`); any new renderer component in `COLLECTION_RENDERERS`. Renderers must early-exit on missing `entry` and treat `Content` as optional — follow `GenericRenderer`'s shape.

### Canonical tag slugs in content; aliases only in tag YAML

Aliases in `src/content.config.ts` tag schema are a runtime safety net, not a feature to rely on. Content should always link to canonical slugs; aliased links in content are a data bug.

### CSS-first responsive, no JS breakpoint detection

Layout responds to viewport via media queries. `matchMedia` in JS is reserved for cases where *interaction state itself* differs by breakpoint (e.g. a desktop-only peek state), not for layout switching. Document the exception narrowly when it applies.

## Workflow

### Experiments live on dev-only routes

`/experiment` should create throwaway pages under `src/pages/_experiments/` with synthetic fixtures (e.g. 10 fake cards for an overflow experiment). Don't prototype by mutating production components and reverting.

### Plans must name the selectors and CSS variables they touch

Given the selector contract and CSS custom property convention above, a plan file should explicitly list any new class names it adds to the JS contract and any new CSS variables it introduces. Reviewers and future sessions should see this without re-reading the diff.
