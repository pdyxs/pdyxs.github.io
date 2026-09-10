# Styling: theme, palette, dither, where CSS lives

## Theme switching (`data-theme`)

All color switching is driven by the `data-theme` attribute on `<html>`. It is always either `"light"` or `"dark"` in the DOM — the CSS never needs to know about "system". The JS resolves system → actual before setting the attribute.

**Anti-FOUC init pattern:** An inline `<script is:inline>` in `<head>` (in `Base.astro`) synchronously reads `localStorage.getItem('theme')` and `window.matchMedia('(prefers-color-scheme: dark)').matches`, resolves the theme, and sets `document.documentElement.dataset.theme` before first paint. This prevents a flash of the wrong theme.

**Three-state preference:** `localStorage` stores `"light"`, `"dark"`, or is absent/`"system"`. When system, a `matchMedia` change listener keeps `data-theme` in sync as the OS setting changes.

**Rule:** Any new colored surface must use a CSS custom property from `:root` (or the `html[data-theme="dark"]` override block in `global.css`). No hardcoded hex literals or `background: white` outside `:root`.

## Anything that ships in a card fragment is styled in `global.css`

A card fragment is fetched and injected into whatever page the visitor is
already on. Astro only bundles a component's scoped `<style>` into the pages
that render that component **at build time**, so a scoped rule on fragment
markup simply does not exist on the page the fragment lands in — the card
paints unstyled and only looks right after a reload onto `/card/...`, which is
what makes this invisible in local single-page testing.

So a component whose markup can arrive inside a fragment carries **no scoped
`<style>` at all**; its rules go in `global.css`, like `.card-header`,
`.generic-bleed`, `.stack-pile` and `.series-*` already do. That includes every
card renderer, every nav renderer, and anything they compose
(`SeriesDateBar`, `SeriesDotStrip`, `SeriesNavRenderer`).

The second, independent reason for the same placement: **every** entry in the
stack renders its own copy of the fragment markup, so a rule that is only true
of the *active* card (`.series-floating-*`, `.card-header--stuck`) has to name
`.stack-card--active` — which a scoped rule cannot do.

**Islands were never really exempt, and treating them as one was the bug**
(issue: the Art Heist gallery report). A Svelte island's scoped stylesheet is
linked into a page's `<head>` by Astro/Rollup at build time, same as any other
component's CSS — it is not inlined into the JS chunk the `astro-island`
element loads. `client:load` only ships the *behaviour*; the CSS still
depends on some page having rendered the island at build time, and Rollup's
default per-page code-splitting only links a component's CSS into the pages
that did. `ImageGallery.svelte` and `Lightbox.svelte` are only ever used from
a single-card render, so nothing else on a lens page happened to pull their
CSS in — unlike `CardStrip`/`BrowseCard`, whose classes a lens's own results
grid already uses, which is what made *those* look exempt (they aren't; they
were one route change away from the same failure). Pushing a card fetched
`ImageGallery`'s markup as a fragment with no such luck: the gallery rendered,
fully unstyled. Going the other direction broke worse — a cold `/card/...`
load with a lens behind it in `from=` renders that lens's filter panel too
(every stack entry's body is mounted regardless of collapse state), and
`FilterBar`/`DimensionButton`/`BrowseResults` and the rest are only ever used
from lens pages: raw `<button>`s, an error banner, no CSS at all. Neither
direction broke on a cold load of the page that *does* own the component
(that request's own `<head>` links its own CSS) or in `astro dev` (Vite
serves every imported component's CSS regardless of page), which is why this
shipped invisibly both times.

**The fix is `cssCodeSplit: false` in `astro.config.mjs`'s `vite.build`**, not
a per-component rule. Any location can be pushed onto, or sit behind, any
other, so "which pages happen to already import this component" is never
actually a safe signal — moving individual components' CSS to `global.css`
(the fix above, for `.card-header` and friends) only relocates the same
whack-a-mole to the next island nobody thought to check. Disabling Rollup's
CSS code-splitting merges every page's CSS into one bundle every page links,
so a scoped `<style>` is available wherever its component can land, full
stop — no per-component discipline required, and Svelte's normal component
scoping (`.foo.svelte-xxxxx`) still holds, so island CSS stays scoped like
everything else. `src/config.test.ts` guards the config flag against being
quietly reverted. The site's total CSS is small enough (~105KB across two
chunks) that paying it on every page beats re-litigating which components are
"safe" to leave scoped-and-hoped; revisit if that budget grows enough to
matter.

## All semantic colors and spacing go through CSS custom properties

No hex literals or raw pixel values outside `:root` for anything that represents a design token (colors, spacing, radii, breakpoints). Dark-mode support and future theming depend on this.

The palette is **two colours**: ink (`--color-text`) and paper (`--color-bg`), pure black and pure white, swapped by `data-theme`. Everything greyscale derives from those two — `--color-surface`, `--color-border-light` and `--color-text-muted` are aliases, and every other tone is a `--dither-N` level built from the same two colours. There is no grey. De-emphasis is expressed by size and weight, never by a faded value; **an `opacity` used to soften a colour is a bug**, because it renders as the grey the palette doesn't have.

## The dither is one fixed, viewport-anchored grid — never give it a transformed ancestor

Every `--dither-N` is a stack of `radial-gradient(circle at 0.5px 0.5px, … 0.564px, #0000 0.584px) 0 0/4px 4px **fixed**` layers — sub-pixel dots in 1px cells. `gen-dither.mjs` picked `TILE = 4` so those cells land on the device pixel grid (`// 4px/4 = 1px cells, pixel-aligned`), and `fixed` anchors the grid to the **viewport** rather than to each element's own box.

That makes the dither a single global dot screen; a dithered element just clips its window onto it. Elements can therefore scroll, animate, resize or slide freely — the pattern never moves, so it is never re-rasterised at a new sub-pixel phase. (Element-anchored, it was: any movement made the 0.564px dots land differently on the pixel grid every frame and the surface visibly shimmered.)

**`fixed` must stay inside the token.** Consumers write `background: var(--dither-N)`, and the `background` shorthand *resets* `background-attachment` — a separate longhand would have to follow the shorthand at all ~49 call sites and would be forgotten. Add it in `dot()` in `gen-dither.mjs`, nowhere else.

**The trap:** a `transform`, `filter`, `backdrop-filter`, `will-change: transform`, `contain: paint` or `perspective` on any **ancestor** of a dithered element creates a containing block for fixed backgrounds. The grid silently re-anchors to that ancestor and the shimmer comes back, with no error and no obvious cause. Before adding any of those to a container (a drag interaction, a parallax, a compositing hint), check whether anything inside it carries a dither.

Two consequences worth knowing:

- **All levels share one grid**, so adjacent surfaces at different levels line up dot-for-dot.
- **View Transitions** are unaffected either way: they snapshot the element to a bitmap and transform *that*, so a dithered header scales as an image. It can look soft mid-morph; it does not shimmer.

`background-attachment: fixed` is a known scroll-performance cost (the background repaints rather than being translated by the compositor) and is unreliable on iOS Safari, where it may degrade to `scroll`. Treat the no-shimmer guarantee as solid on desktop and best-effort on iOS.

## Selected states use the `--color-selected-*` tokens

A selected control is the page inverted — it sits at the ink end of the dither ramp, so it needs the *mirror* of every flat-surface rule, not just swapped text and background:

| | rest | hover |
|---|---|---|
| flat surface | `L0` (paper) | `--color-bg-hover` (`L2`) |
| selected surface | `--color-selected-bg` (`L16`, ink) | `--color-selected-bg-hover` (`L14`) |

`--dither-14` is paper dots on ink, so the hover delta is identical in both directions. Three tokens cover it: `--color-selected-bg` (fill, border, **and text-stroke**), `--color-selected-fg` (text, counts, glyphs, internal dividers), `--color-selected-bg-hover`.

The stroke is the trap. `-webkit-text-stroke` is inherited and paper-coloured by default (see the `.dither-text` block in `global.css`), which is correct on a flat surface and *wrong* on an inverted one: paper stroke behind paper glyphs fattens them instead of clearing dots behind them. Any selected rule whose element inherits the stroke must restate `-webkit-text-stroke-color: var(--color-selected-bg)`.

These are applied as per-component rules rather than one shared class because Svelte's scoping inflates selector specificity — a global `.is-selected` loses to a component's own scoped base rule. The tokens are the contract; the rules live with the component.

## Code blocks are monochrome, and an untagged fence wraps

`markdown.syntaxHighlight` is `false` in `astro.config.mjs`. Shiki's themes hardcode hex (the default `github-dark` painted every block `#24292e` in *both* themes), and a two-colour palette has nowhere to put syntax hues. Astro therefore emits bare `<pre><code>` and `global.css` owns the surface: ink on `--dither-2`, with the `.dither-text` paper stroke so the dots don't read through the mono glyphs.

The language tag is the wrap switch. A tagged fence keeps `overflow-x: auto` — wrapping real code makes its line breaks ambiguous. An **untagged** fence is almost always prose someone reached for a code block to quote, so `pre > code:not([class])` gets `white-space: pre-wrap` plus a `-2ch` hanging indent. Turning `syntaxHighlight` back on would break that selector, since Shiki always emits a class.

## CSS-first responsive, no JS breakpoint detection

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

