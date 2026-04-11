# Feature: Front Page Panel Links + Card Transition Animations

**Status:** ARCHITECTURE
**Created:** 2026-04-11
**Updated:** 2026-04-11

## Context

The homepage currently shows the 5 panel cards (who/what/why/when/where) as an accordion — clicking expands content inline. This should instead show them as clickable card-shaped links that push the card onto the stack. Opening a card should animate: the clicked panel link morphs into the full card while everything else fades out. Closing the top-level card reverses the animation, returning to the homepage. A new reusable `CardLink` component handles both the homepage panel links and in-card push links (e.g., related project links).

## Architecture Decisions

1. **New `CardLink` component** — replaces both accordion panel summaries and existing `[data-push-card]` elements. Renders a clickable `div.card-link[data-push-card]` with a `CardHeader` inside. The `view-transition-name` is set on the outer `div.card-link` (not on the inner `CardHeader`) so the whole element participates in the morph.

2. **View Transitions API for animations** — `document.startViewTransition()` wraps `showStack()` / `showHomepage()` DOM mutations. The named outer container morphs position between panel link and stack card. Progressive fallback: instant toggle for unsupported browsers.

3. **VT name on outer container, body grows separately** — The `view-transition-name` (derived as `'panel-' + uid.replace(/\//g, '-')`) is set on the `.card-link` outer div (old state) and on the `.stack-card` outer div (new state). The `stack-card-body` is hidden at VT snapshot time via a `body-wrapper` collapsed to `0fr`, so the VT sees identically-sized bordered boxes in old and new states (making the crossfade imperceptible). After `vt.finished`, the body-wrapper opens via a CSS grid `0fr → 1fr` transition, growing the card border and content together. On close, the body-wrapper collapses first (CSS transition), then VT morphs the header back.

4. **`body-wrapper` + inner padding pattern** — `stack-card-body` must have no padding (padding on a grid-child prevents `0fr` from collapsing to zero height). Instead, an inner `div.stack-card-body-inner` carries the padding. This pattern applies to all card renderer components.

5. **Two distinct VT names for open vs close** — `panel-card-open` is set on both elements when opening; `panel-card-close` when closing. This avoids class-toggle timing ambiguity and allows distinct `::view-transition-*` CSS rules per direction if needed.

6. **Remove source-card prepend behaviour** — the current `pushCard(url, sourceUid)` logic that prepended the source accordion panel as a collapsed card is dropped. From the homepage (stack empty), the clicked card becomes the sole card in the stack; close returns directly to the homepage.

7. **Remove accordion entirely** — `index.astro` drops the `<details>`/`<summary>` markup and all accordion styles. The homepage renders only a `<nav class="panel-links">` of 5 `CardLink` components. No inline content is pre-rendered on the homepage.

8. **CardLink styling is context-sensitive** — `CardLink` provides structure and behaviour; appearance is controlled by the parent context (`.panel-links .card-link` for homepage entries, inherited defaults for in-card usage).

9. **Border fix: `.stack-card > .card-header`** — `CardHeader` carries a full border for standalone use (panel links). Inside `.stack-card` the outer card border covers three sides, so `.stack-card > .card-header` overrides to `border: none; border-bottom: var(--border-width) solid var(--color-border)`. This also makes the VT old/new screenshots visually identical (both look like a bordered box with a striped header), making the crossfade imperceptible.

## System Diagram

```mermaid
flowchart LR
  subgraph Pages
    IndexPage["index.astro [page]"]
    CardPage["card/path.astro [page]"]
  end
  subgraph Components
    CardLink["CardLink.astro [component]"]
    CardHeader["CardHeader.astro [component]"]
    StackNav["StackNav.astro [script]"]
  end
  subgraph DOM
    HomepageEl["#homepage [div]"]
    CardStackEl["#card-stack [div]"]
  end

  IndexPage -->|"renders ×5"| CardLink
  CardLink -->|"renders"| CardHeader
  CardLink -->|"data-push-card + view-transition-name on outer div"| StackNav
  StackNav -->|"startViewTransition → toggle hidden"| HomepageEl
  StackNav -->|"startViewTransition + vt.finished → body-wrapper.open"| CardStackEl
  StackNav -->|"fetch /card/{uid}"| CardPage
  CardPage -->|"HTML fragment .stack-card"| StackNav
```

## Structure

### New Files

- [ ] `src/components/CardLink.astro`
  - Props: `uid: string`, `title: string`, `titleSuffix?: string`
  - Renders:
    ```astro
    <div
      class="card-link"
      data-push-card={`/card/${uid}`}
    >
      <CardHeader {title} {titleSuffix} />
    </div>
    ```
  - Note: `view-transition-name` is injected dynamically by StackNav JS (not set in HTML) to avoid name conflicts when multiple CardLinks are on screen
  - Scoped style: `cursor: pointer`, hover background, no extra padding

### Modified Files

- [ ] `src/pages/index.astro`
  - Changes:
    - [ ] Remove `render()` calls and `rendered` map (no inline content needed)
    - [ ] Replace `<div class="accordion">` + `<details>` markup with `<nav class="panel-links">` containing one `<CardLink>` per panel
    - [ ] Remove all accordion-specific scoped CSS
    - [ ] Add `.panel-links` and `.panel-links .card-link` scoped styles
    - [ ] Import `CardLink` component

- [ ] `src/components/StackNav.astro` (the `<script>` block)
  - Changes:
    - [ ] Remove `sourceUid` parameter and the block that prepends a collapsed source card in `pushCard`
    - [ ] In `pushCard(url)`: pre-fetch card; set `view-transition-name: panel-card-open` on both the clicked `.card-link` outer div and the fetched `.stack-card` outer div; call `startViewTransition`; after `vt.finished` clear the names and call `bodyWrapper.classList.add('open')`
    - [ ] In close button handler: call `bodyWrapper.classList.remove('open')`; wait for `transitionend`; set `view-transition-name: panel-card-close` on both `.stack-card` and matching `.card-link`; call `startViewTransition` with `showHomepage()`; after `finished` clear names
    - [ ] Remove the "exclusive accordion" block at the bottom
    - [ ] Remove `sourceUid` passing from the `tag:` link click handler

- [ ] `src/styles/global.css`
  - Changes:
    - [ ] Add `::view-transition-group(panel-card-open)` and `::view-transition-group(panel-card-close)` rules: `z-index: 1; animation-duration: 300ms; animation-timing-function: ease-in-out`
    - [ ] Add `::view-transition-old/new(panel-card-open/close)` duration rules
    - [ ] Add `::view-transition-old/new(root)` duration rules
    - [ ] Add `.card-link` base styles: `cursor: pointer`, display block
    - [ ] Add `.body-wrapper` styles: `display: grid; grid-template-rows: 0fr; transition: grid-template-rows 300ms ease-out`
    - [ ] Add `.body-wrapper.open` style: `grid-template-rows: 1fr`
    - [ ] Add `.stack-card-body` update: remove `padding`, add `overflow: hidden; min-height: 0`
    - [ ] Add `.stack-card-body-inner` style: `padding: var(--space-lg)`
    - [ ] Add `.stack-card > .card-header` override: `border: none; border-bottom: var(--border-width) solid var(--color-border)`

- [ ] All card renderer components (`GenericRenderer.astro`, `TagRenderer.astro`, `PuzzleRenderer.astro`) and `card/[...path].astro`
  - Changes:
    - [ ] Wrap the `.stack-card-body` content in `<div class="stack-card-body-inner">` so padding lives on the inner element, not the grid child

## Dependencies

- **`CardHeader.astro`** — used inside `CardLink`; no changes needed to the component itself
- **`StackNav.astro`** — handles all push/pop/transition logic; sole consumer of `data-push-card` and VT calls
- **`/card/[...path].astro`** — fetch target for card HTML; needs `body-wrapper` + `body-inner` wrapping
- **`GenericRenderer.astro`, `TagRenderer.astro`, `PuzzleRenderer.astro`** — need inner padding wrapper

## Unknowns & Experiments

### view-transition-name on dynamically-fetched HTML

- **Unknown**: Does injecting `view-transition-name` on a freshly-fetched (but not yet appended) DOM node, then appending it inside `startViewTransition()`, produce a clean position morph?
- **Risk**: Morph falls back to crossfade if name not recognised on new element.
- **Experiment**: Minimal test page — inject name on detached node, append inside VT callback, observe.
- **Result**: CONFIRMED — setting `element.style.viewTransitionName` on a detached node before appending inside `startViewTransition()` works correctly. The VT captures the name from the new DOM state after the callback.
- **Impact**: None. Architecture unchanged.

### Default root crossfade behaviour with named elements

- **Unknown**: Does the default VT crossfade look good alongside the named-element morph, or does it produce artefacts?
- **Risk**: May need custom CSS overrides.
- **Experiment**: Build minimal test page, observe crossfade and morph together.
- **Result**: CONFIRMED with significant findings — the architecture evolved substantially during experimentation:
  - VT name must be on the **outer container** (`.card-link` / `.stack-card`), not on `.card-header`. Naming only the header causes the card body to appear at its final position rather than growing with the header.
  - The VT crossfade between old and new screenshots creates the size-morph illusion. To make it imperceptible, old and new must look visually identical — achieved by collapsing `stack-card-body` to `0fr` before the VT snapshot and by fixing the double-border issue (`.stack-card > .card-header` removes three sides of its own border since the outer card border covers them).
  - Body grow animation must run **after** `vt.finished` as a real CSS transition on the live DOM (not as a VT pseudo-element animation). CSS animations on live elements run while hidden under VT pseudo-elements.
  - The `0fr` body collapse requires padding to be on an **inner** element, not the grid child (padding is not collapsed by `min-height: 0`).
  - Two distinct VT names (`panel-card-open` / `panel-card-close`) eliminate the need for a class-toggle timing hack.
- **Impact**: Architecture decisions 3–5 and 9 added; Structure section substantially updated.

## Notes

- 2026-04-11: Initial architecture discussion. Accordion replaced with 5 `CardLink` panel links. `CardLink` is generic — used on homepage and inside card bodies for in-stack pushes. View Transitions API provides morph animation; progressive fallback is instant toggle. Source-card prepend behaviour removed. Two experiments needed before implementation.
- 2026-04-11: All experiments resolved through iterative test-page exploration. Architecture confirmed with significant refinements: VT name on outer container, body grows via CSS grid trick after `vt.finished`, border fix required. Ready for plan review.
