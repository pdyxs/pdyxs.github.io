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

### Renderer registration is mandatory

Any new content collection must set its default renderer via `_config.yaml` in its content directory (resolved by `resolveFolderCascade` in `src/lib/folder-config.ts`, which walks every ancestor `_config.yaml` from the dimension root down — nearest wins); any new renderer component must be registered in `COLLECTION_RENDERERS` (`src/lib/renderers.ts`). Renderers must early-exit on missing `entry` and treat `Content` as optional — follow `GenericRenderer`'s shape.

Panel sections (`group:` on a container `_config.yaml`, ordered by the dimension
root's `groupOrder`) apply at **every** drill level, not just the root: drilling
into Puzzles shows the three `group: Series` folders, then a divider, then the
generated difficulty ratings. A level whose nodes are all ungrouped collapses to
one section and renders as a flat list, which is every other level on the site.

`width` and `gallery` cascade the same way (`_config.yaml` → `FolderCascade` → `ResolvedCard`, with a card's own frontmatter winning). Cards in a folder usually share a shape, and the shape is what sets the width: `what/puzzles` declares `520px` because a puzzle card *is* its square grid image, and at the site's 680px default that image dominates the viewport. Declare both per-folder, not per-card.

The applier is `applyMaxWidth` in `CardStack.svelte`, and it writes `--max-width` to **both** `<html>` and `#card-stack`. That is not redundant: the server renders `#card-stack` with the initial location's width inline so the first paint is right before hydration, and an inline style on `#card-stack` beats an inherited value from `<html>` for everything inside it. Writing only to `<html>` left a card pushed on top of a wide lens (browse is 960px) wearing the lens's width forever.

### Nav renderer pattern (`NAV_RENDERERS`)

Collections that need custom navigation (e.g. prev/next chapter buttons, position indicators) register a nav renderer in `NAV_RENDERERS` (`src/lib/renderers.ts`). A nav renderer owns the full card shell — header and body structure — and receives the content renderer as `<slot />`. It is responsible for rendering `<CardHeader>` (or a custom header), the `.body-wrapper` / `.stack-card-body` structure, and any footer nav. Props passed by `card/[...path].astro`: `title`, `titleSuffix`, `entry`, `allEntries`.

A nav renderer is usually declared by the folder (`navRenderer: series` in a
`_config.yaml`), but `getSeriesSiblings` matches on the `series:` frontmatter
value alone — so a *subset* of a folder could be its own ordered run by
declaring `navRenderer`/`series`/`order` in frontmatter instead. Keep `series:`
values globally unique; they are matched across the whole collection, not
within a folder.

`SeriesNavRenderer` shows the whole series as a `CardStrip` — the same component
as the "Cards about this" section — rather than prev/next buttons. Two buttons
can only say what is immediately adjacent, which is the least interesting thing
about a series; the strip shows the run, where you are in it, and lets you jump
anywhere. The open card is in the strip, passed as `currentUid`: `BrowseCard`
renders it as a marked, non-navigating tile (`current`) and the strip opens
scrolled to it.

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
display rows. `GenericRenderer` takes the result. `WorkRenderer` still has its
own `when`/`roles` `<dl>` — unify it when that renderer is next touched.

`difficulty` and `puzzle_type` stay named fields rather than authored `meta`
rows because `difficulty` feeds three renderings, not one.

### Difficulty is parsed once and rendered as stars

`src/lib/difficulty.ts` owns the whole of it. LMD rates a puzzle 1–5 and words
it "Level 3 (Medium)", which is what frontmatter carries — that string stays the
source of truth (it's what the LMD page says, and it round-trips on a re-rate),
but it isn't what a reader reads and it sorts alphabetically, which files Level 5
next to Level 1. So `parseDifficultyLevel` reads the rating out once and three
consumers render it:

- the card's credits row (`resolveMetaRows`) — `★★★☆☆`, with an `ariaLabel` so a
  screen reader says "Difficulty 3 out of 5" rather than five star characters
- `puzzleDifficultyGenerator` (`filter-generators.ts`) — the `what:puzzles/level-3`
  filter tag
- `generatedDisplayName` — that value's label in the panel, the same stars

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
