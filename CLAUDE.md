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

Global architecture principles (View→Logic one-way, events over direct calls, module independence, pure decisions / thin effects, single source of truth for state) live in `~/.claude/rules/architecture.md`. The project-specific invariants below are how those principles land here, plus constraints unique to this codebase.

### StackNav owns all card-stack mutations

Any code that pushes, collapses, expands, reorders, or hides cards goes through `src/components/StackNav.astro`. Renderers and other scripts must not reach into `#card-stack` directly. This keeps the VT lifecycle, state classes, and layout updates in one place.

### Card state lives in classes, not JS variables

`stack-card--active` and `stack-card--collapsed` are the authoritative representation of a card's state; `.body-wrapper.open` is derived from it. This is the "single source of truth" global rule applied to DOM classes — never shadow card state into JS variables, `dataset` entries, or parallel classes.

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

## Conventions

### All semantic colors and spacing go through CSS custom properties

No hex literals or raw pixel values outside `:root` for anything that represents a design token (colors, spacing, radii, breakpoints). Dark-mode support and future theming depend on this.

### Renderer registration is mandatory

Any new content collection must appear in `COLLECTION_DEFAULTS` (`src/lib/cards.ts`); any new renderer component in `COLLECTION_RENDERERS` (`src/lib/renderers.ts`). Renderers must early-exit on missing `entry` and treat `Content` as optional — follow `GenericRenderer`'s shape.

### Canonical tag slugs in content; aliases only in tag YAML

Aliases in `src/content.config.ts` tag schema are a runtime safety net, not a feature to rely on. Content should always link to canonical slugs; aliased links in content are a data bug.

### CSS-first responsive, no JS breakpoint detection

Layout responds to viewport via media queries. `matchMedia` in JS is reserved for cases where *interaction state itself* differs by breakpoint (e.g. a desktop-only peek state), not for layout switching. Document the exception narrowly when it applies.

## Testing

### Test location and commands

Tests are co-located with source as `src/**/*.test.ts`. Shared utilities live in `src/test/`.

```bash
npm test          # run once (CI / regression gate)
npm run test:watch  # watch mode during development
```

### Custom Vitest environment

The config (`vitest.config.ts`) uses a custom environment at `src/test/vitest-env.ts` named `astro-happy-dom`. This is required because the built-in `happy-dom` Vitest environment sets `viteEnvironment: "client"`, causing the Astro Vite plugin to return browser stubs for `.astro` imports instead of real SSR component factories. The custom environment sets `viteEnvironment: "ssr"` while still providing happy-dom DOM globals.

**Never rename this file to `happy-dom`** — that name is hardcoded in Vitest to use `viteEnvironment: "client"`.

### DOM API gaps in happy-dom

- `document.startViewTransition` — not available; VT paths must be guarded and tested via instant-fallback branch only.
- `element.animate()` — not available in this happy-dom version; future StackNav tests that exercise animation paths must guard with `typeof el.animate === 'function'`.

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

### Experiments live on dev-only routes

`/experiment` should create throwaway pages under `src/pages/_experiments/` with synthetic fixtures (e.g. 10 fake cards for an overflow experiment). Don't prototype by mutating production components and reverting.

### Plans must name the selectors and CSS variables they touch

Given the selector contract and CSS custom property convention above, a plan file should explicitly list any new class names it adds to the JS contract and any new CSS variables it introduces. Reviewers and future sessions should see this without re-reading the diff.
