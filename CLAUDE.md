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

### Svelte islands

Interactive components use Svelte 5 (runes syntax) with `client:load`. Key conventions:

- Svelte store files live in `src/stores/` — not `src/lib/`. The `src/lib/` directory is framework-agnostic pure TypeScript.
- `CardStack.svelte` is the only Svelte island currently. New islands follow the same shape: `$state` for local reactive state, `$derived` for computed values, `$effect` for thin DOM side effects that can't be done with template bindings.
- `{@html}` silently drops `<script>` tags in injected HTML strings. Future card renderers must not rely on inline scripts — renderer interactivity must be a Svelte component or a global delegated listener, not an inline `<script>` in the rendered HTML fragment.

## Invariants

These are load-bearing. Plans and experiments must respect them; violating any of them is a refactor, not a local change.

Global architecture principles (View→Logic one-way, events over direct calls, module independence, pure decisions / thin effects, single source of truth for state) live in `~/.claude/rules/architecture.md`. The project-specific invariants below are how those principles land here, plus constraints unique to this codebase.

### CardStack.svelte owns all card-stack mutations

Any code that pushes, collapses, expands, reorders, or hides cards goes through `src/components/CardStack.svelte`. `src/components/StackNav.astro` is a thin Astro shell that renders `<CardStack client:load />` — it has no `<script>` block. Renderers and other scripts must not reach into `#card-stack` directly. This keeps the VT lifecycle, state, and layout updates in one place.

### Svelte store is the authoritative card-stack state

The `writable<StackState>` store in `src/stores/card-stack-store.ts` is the single source of truth for which cards are in the stack and which is active. `CardStack.svelte` derives CSS classes (`stack-card--active`, `stack-card--collapsed`) and layout state from the store via `$derived` and applies them via `$effect`. The CSS classes are styling contracts only — never query them in JS to infer state.

### Stable selector contract

These class names are a CSS/layout contract — renaming any of them is a CardStack.svelte + CSS refactor, not a local change:

- `#card-stack`
- `.stack-card`, `.stack-card--active`, `.stack-card--collapsed`
- `.card-header`
- `.body-wrapper`, `.body-wrapper.open`
- `.stack-card-body`, `.stack-card-body-inner`

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

`CardStack.svelte` derives layout via `$derived(computeStackLayout($stackStore))`. Any store mutation automatically triggers a re-derivation and `$effect` re-run — no explicit layout update call is needed or allowed. Don't add explicit `computeStackLayout()` calls to event handlers; update the store and let reactivity handle the rest.

## Conventions

### All semantic colors and spacing go through CSS custom properties

No hex literals or raw pixel values outside `:root` for anything that represents a design token (colors, spacing, radii, breakpoints). Dark-mode support and future theming depend on this.

The palette is **two colours**: ink (`--color-text`) and paper (`--color-bg`), pure black and pure white, swapped by `data-theme`. Everything greyscale derives from those two — `--color-surface`, `--color-border-light` and `--color-text-muted` are aliases, and every other tone is a `--dither-N` level built from the same two colours. There is no grey. De-emphasis is expressed by size and weight, never by a faded value; **an `opacity` used to soften a colour is a bug**, because it renders as the grey the palette doesn't have.

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

### Renderer registration is mandatory

Any new content collection must set its default renderer via `_config.yaml` in its content directory (resolved by `resolveFolderCascade` in `src/lib/folder-config.ts`, which walks every ancestor `_config.yaml` from the dimension root down — nearest wins); any new renderer component must be registered in `COLLECTION_RENDERERS` (`src/lib/renderers.ts`). Renderers must early-exit on missing `entry` and treat `Content` as optional — follow `GenericRenderer`'s shape.

### Nav renderer pattern (`NAV_RENDERERS`)

Collections that need custom navigation (e.g. prev/next chapter buttons, position indicators) register a nav renderer in `NAV_RENDERERS` (`src/lib/renderers.ts`). A nav renderer owns the full card shell — header and body structure — and receives the content renderer as `<slot />`. It is responsible for rendering `<CardHeader>` (or a custom header), the `.body-wrapper` / `.stack-card-body` structure, and any footer nav. Props passed by `card/[...path].astro`: `title`, `titleSuffix`, `entry`, `allEntries`.

### Collection view renderer pattern (`COLLECTION_VIEW_RENDERERS`)

Collection views are browsing cards for an entire collection — e.g. `/card/posts` lists all posts with tag filter chips. They use bare collection-name UIDs (`posts`, `projects`) with no id component, which is a deliberate exception to the `collection/id` invariant. Register them in `COLLECTION_VIEW_RENDERERS` (`src/lib/renderers.ts`). The renderer is a plain Astro component that fetches all cards server-side and passes them to `<CollectionBrowser client:load />`. To link to a collection view from card content, use `[text](collection:posts)` — `CardStack.onDocumentClick` handles the `collection:` protocol and pushes `/card/posts`.

### Internal links in card content use a protocol, never an absolute URL

Body content links to the rest of the site through one of three protocols, all handled by `onDocumentClick` in `CardStack.svelte`. Each stays inside the card stack — an ordinary `https://pdyxs.wtf/...` or `/card/...` href is a full page load that discards the stack, and is treated as a data bug (guarded by `src/lib/content-links.test.ts`).

| protocol | pushes | example |
|---|---|---|
| `card:<uid>` | that single card | `[Numbeanies](card:what/games/digital/numbeanies)` |
| `collection:<dim>:<value>` | browse lens pre-filtered to that tag | `[Projects](collection:what:projects)` |
| `tag:<value>` | browse lens filtered to a tag value | `[Svalbard](tag:where:europe/norway/svalbard)` |

`<uid>` is the full dimension-rooted content path (`what/games/digital/numbeanies`), the same string as `data-uid`. Use `card:` for a single entry and `collection:` for a folder/series — a series folder has no card of its own, so `collection:what:posts/stories/arctic` is the only way to reach it.

### Canonical tag slugs in content; aliases only in tag YAML

Aliases in `src/content.config.ts` tag schema are a runtime safety net, not a feature to rely on. Content should always link to canonical slugs; aliased links in content are a data bug.

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
