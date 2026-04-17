# Milestone: Desktop Card Stack

## Goal

Transform the card stack from a vertical-only, imperatively-driven component into a reactive Svelte island with a polished desktop layout — collapsed cards fan horizontally across the screen, animated transitions between stack states, and an overflow mechanism for deep navigation paths.

## Motivation

The current card stack works well on mobile but underuses horizontal screen space on desktop. The vanilla-JS imperative implementation also makes it hard to add new layout logic cleanly. This milestone establishes a reactive foundation (Svelte), adds the desktop horizontal fan layout, and rounds out the experience with purposeful animations throughout.

## Scope

### 1. Svelte card stack migration — [svelte-card-stack](../plans/svelte-card-stack.md)

Migrate the card stack from the imperative `<script>` block in `StackNav.astro` to a `CardStack.svelte` island. Extract `computeStackLayout()` as a pure TS function. Svelte store becomes the single source of truth for stack state. Like-for-like behaviour — no new features, just a clean reactive foundation.

- [ ] Add `@astrojs/svelte` + `svelte` dependencies
- [ ] Create `CardStack.svelte` island with `client:load`
- [ ] Create `src/lib/stack-layout.ts` — pure `computeStackLayout()` with unit tests
- [ ] Create `src/stores/card-stack-store.ts` — `writable<StackState>`
- [ ] Replace `StackNav.astro` `<script>` with thin shell
- [ ] Migrate VT integration into `CardStack.svelte`
- [ ] Resolve experiments: `{@html}` script execution + VT flush timing

### 2. Card stack animations

Add purposeful transitions for baseline card stack operations (mobile and desktop). Uses Svelte's `transition:` and `animate:` directives where appropriate, CSS transitions elsewhere.

- [ ] Push animation — new card slides/fades onto the stack
- [ ] Close/pop animation — card exits the stack
- [ ] Stagger position transitions — collapsed cards animate to new `--stack-index` positions when the stack changes
- [ ] Body expand/collapse — review whether the current CSS grid trick needs refinement with Svelte

### 3. Horizontal card stack layout — [horizontal-card-stack](../plans/horizontal-card-stack.md)

Desktop-only horizontal fan layout. Collapsed cards become slim vertical strips; the active card fills remaining horizontal space. Stagger (8px) gives a fanned-card visual effect. Overflow `⋯` strip for deep stacks.

- [ ] Desktop breakpoint CSS (681px) — `flex-direction: row`, strip widths, stagger
- [ ] `updateStackLayout()` wired into Svelte component (uses `computeStackLayout()`)
- [ ] Fan-corner sibling divs for stagger illusion
- [ ] Overflow `⋯` strip — collapsed state, expanded overlay panel, outside-click dismiss
- [ ] `[data-hidden]` cards for overflow
- [ ] Right-side flat `⋯` strip for "active card in middle" case

## Dependencies

- Existing View Transitions architecture (established)
- `CardLink.astro` (unchanged)
- `global.css` card stack styles (evolving through this milestone)

## Order

Must be built in sequence: **1 → 2 → 3**. The Svelte migration is a prerequisite for everything else. Animations can start during or after migration but before the horizontal layout adds new layout states to animate.
