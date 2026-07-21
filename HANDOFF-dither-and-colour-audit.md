# Handoff: dithered surfaces (shipped) → full colour audit (next)

Written 2026-07-21. Part 1 describes work already on `astro-rebuild` (commit `a8b9591`).
Part 2 is the brief for the next task. Read `CLAUDE.md` first — its invariants still apply.

---

## Part 1 — What shipped

### The idea

Greyscale surfaces are no longer flat greys. They're **ordered (4×4 Bayer) dithers
built from the theme's two colours** — ink (`--color-text`) and paper (`--color-bg`) —
so the *proportion of ink* reads as a grey value and every dithered surface inverts
correctly when `data-theme` flips. No separate dark-mode values are needed anywhere.

### Generation

`scripts/gen-dither.mjs` → `src/styles/dither.generated.css`, which is `@import`ed at
the **top** of `global.css` (an `@import` must precede all other rules).

- Emits `--dither-0 … --dither-16` (full surfaces) and `--dither-ink-0 … 16`
  (ink-only overlays; see "grow" below). Plus an `@media print` block that redefines
  every level to a flat `color-mix` grey so dithered surfaces print predictably.
- **Method:** one `radial-gradient` dot per "on" cell, `background-size: 4px`.
  Colours are **live `var()` references**, which is the whole point: the set is
  theme-aware with no dark override, and never needs regenerating when a colour
  token changes — only if the tile size or matrix changes.
- **4px tile** (4px / 4 cells = 1px cells, pixel-aligned). 5px was tried and
  rejected: 1.25px cells don't align to the pixel grid and visibly alias.
- Run via `npm run generate:dither`; chained into `predev` and `prebuild`.
  Output is deterministic — re-running produces a byte-identical file.

Usage is just `background: var(--dither-6);`.

### Level rules

| Surface | Rest | Hover |
|---|---|---|
| Card headers (expanded + collapsed vertical) | **L2** | **L4** |
| Flat/paper surfaces (card previews, listing rows, buttons, panel items, toggle) | flat | **L2** |

Hover **steps the dither up one notch** rather than being a fixed level. Two tokens:

```css
--color-bg-hover:        var(--dither-2);  /* flat surface → hover */
--color-bg-hover-strong: var(--dither-4);  /* already-L2 surface → hover */
```

The four rules that hover a `.card-header` use the `-strong` token
(`global.css` `.stack-card--collapsed:hover`, `CardLink.astro`, `FilterSlot.svelte`,
`PinnedSlot.svelte`). Everything else uses `--color-bg-hover`.

The user's stated rule: **L2 for non-hover (never past L3), L3/L4 for hover.**

### Text over dither

Text on a dithered surface gets a **paper-coloured stroke**, not a knockout patch:

```css
-webkit-text-stroke: var(--dither-text-stroke, 4px) var(--color-bg);
paint-order: stroke fill;
```

**The key property:** the stroke is painted in the *paper* colour, so over a flat
background it is **completely invisible** — it only does work where dither shows
through, clearing dots immediately around the glyphs. Because the fill paints over it
at full size, the glyph shape is unchanged, so there's **no weight shift**. That's why
it's safe to apply at rest to anything that *might* later sit over dither.

Widths: **4px** header titles, **3px** smaller UI text (via `--dither-text-stroke`).
Browse-card tag chips opt out (`-webkit-text-stroke-width: 0`) because they have their
own opaque backing — see gotcha 6.

The old ruled-line `repeating-linear-gradient` on `.card-header` and all the
`--color-surface` knockout patches are **gone**.

### Files

- `scripts/gen-dither.mjs`, `src/styles/dither.generated.css`
- `src/styles/global.css` — `@import`, tokens, stroke rules, card-header rules
- `BrowseCard.svelte`, `CardLink.astro`, `FilterSlot.svelte`, `PinnedSlot.svelte`
- `public/dither-worklet.js` — Houdini paint worklet, **experiment only**, not used
  in production
- Dev-only routes: `/experiments/dither` (technique comparison, tonal ramps,
  animation/blend demos) and `/experiments/dither-surfaces` (per-surface previews,
  text-legibility treatments)

Verified in light + dark; `npm run check` clean.

---

## Part 2 — Gotchas (these cost real time; don't rediscover them)

1. **`.card-header-title` is emitted by FIVE render paths** — `CardHeader.astro`,
   `LensStackCard.astro`, `FilterSlot.svelte`, `PinnedSlot.svelte`, and a **JS
   template string in `CardStack.svelte`** (`buildPlaceholderHtml`). Styling it via a
   class only covers one. **Style it from `global.css` by class name.**

2. **A token may only be redefined to a dither if it is used *exclusively* as a
   `background`.** `--color-bg-hover` qualified (verified), so one redefine covered
   ~15 surfaces. **`--color-surface` does NOT** — it's also used as a `color:` in ~10
   places, so pointing it at a dither would break those. Always grep before redefining.

3. **Specificity trap:** a rule inside the desktop `@media` block
   (`#card-stack .stack-card--collapsed .card-header-title`, ~line 781) re-applied a
   white knockout and beat the base rules. When a background looks wrong, search the
   *whole* file for that selector, not just the obvious block.

4. **Astro scoped styles don't apply to DOM created in client JS** (`createElement`
   elements never get the scoping attribute). This silently broke the experiment
   page's ramps. Use `is:global` (or render server-side) for JS-built elements.

5. **Ordered dither levels are additive supersets** — level N+1's dots contain all of
   level N's. That's what makes the **"grow"** transition work: hold a
   `var(--dither-N)` base and fade an ink-only `var(--dither-ink-N+1)` overlay 0→1,
   and only the newly-added cells appear. CSS can't tween one multi-layer
   `background` into another, so this (or a stepped swap) is the only cross-browser
   way to animate between levels. Plain opacity-crossfade looks muddy mid-fade;
   Houdini is smooth but Chromium-only.

6. **A paper-coloured stroke becomes visible if the element has its own background**
   that isn't paper. Tag chips sit on `--color-surface`, which in dark mode
   (`#242424`) differs from the stroke colour (`--color-bg`, `#1a1a1a`) — the stroke
   read as a dark halo. Fixed by zeroing the stroke on elements with opaque backings.

---

## Part 3 — Not yet converted

Still flat greys:

- **`--color-surface` panels** — `.stack-overflow` (hidden-cards strip),
  `.stack-overflow-panel` (its dropdown), `.stack-overflow-item` (its rows),
  `DimensionPanel` (filter drill-down), `.theme-toggle`. Also `.browse-card-item`'s
  *rest* state and `.browse-card-tag`'s backing (both deliberately flat), and
  `.browse-dim-dot` (a 5px dot — too small to dither). **`.card` in `global.css`
  appears dead** — no markup matches it; worth deleting.
- **`--status-archived-bg`** — the archived badge.
- **`--color-bg-stripes`** — placeholder-card stripes (still a line motif).

Note these can't be done via a token redefine (gotcha 2) — they need per-selector edits.

---

## Part 4 — NEXT TASK: full colour audit

### Goal

**All text is pure black or pure white. All backgrounds are pure black, pure white, or
dithered.** There are currently several "just-off-black"/"off-white" values in use.

### Good news

`src/styles/global.css` is the **single source of colour** — a scan found **zero** hex
literals outside the `:root` / `html[data-theme="dark"]` blocks. So this is a
token-level change, not a codebase sweep.

### Current inventory

Light (`:root`) — ✅ already pure, ❌ needs a decision:

| Token | Value | |
|---|---|---|
| `--color-bg`, `--color-surface` | `#ffffff` | ✅ |
| `--color-text` | `#000000` | ✅ |
| `--color-border`, `--color-tag-active-border` | `#000000` | ✅ |
| `--color-text-muted` | `#555555` | ❌ **text** |
| `--color-border-light` | `#999999` | ❌ |
| `--color-bg-stripes` | `#555555` | ❌ |
| `--color-tag-active-bg` | `#eaeaea` | ❌ |
| `--color-overlay` | `rgba(0,0,0,.85)` | ❌ near-black |

Dark (`html[data-theme="dark"]`) — **this is where most of the off-blacks live**:

| Token | Value | |
|---|---|---|
| `--color-text` | `#e0e0e0` | ❌ **off-white text** → `#ffffff` |
| `--color-bg` | `#1a1a1a` | ❌ **off-black** → `#000000` |
| `--color-surface` | `#242424` | ❌ off-black |
| `--color-text-muted` | `#aaaaaa` | ❌ **text** |
| `--color-border` | `#c0c0c0` | ❌ off-white |
| `--color-border-light` | `#555555` | ❌ |
| `--color-bg-stripes` | `#888888` | ❌ |
| `--color-tag-active-bg` | `#3a3a3a` | ❌ |

**Status colours are the only chromatic values** (`--status-draft-*`,
`--status-scheduled-*`, `--status-unlisted-*`, `--status-archived-*`). They are
**dev-only** — the badge markup is `import.meta.env.DEV`-gated in *both* renderers
(`CardHeader.astro` and `BrowseCard.svelte`), so it never reaches a production build.
**Probably exempt from the audit; confirm before spending time on them.**

### Important coupling to the dither work

The dither's ink and paper **are** `--color-text` and `--color-bg`. Making them pure
black/white automatically makes **every dithered surface higher-contrast and punchier**.
Re-check the chosen levels (L2 rest / L4 hover) after the change — L2 may read stronger
than it does today and want dropping to L1.

### Open design questions (need the user's call)

1. **`--color-text-muted` has no home in a pure black/white world.** De-emphasis
   currently comes from grey text. Options: express it with size/weight/letter-spacing
   instead; or accept an opacity (which still *renders* grey); or drop the distinction.
   This is the biggest design decision in the audit.
2. **`--color-surface` vs `--color-bg`.** In dark, surface (`#242424`) is a deliberate
   "lift" above bg (`#1a1a1a`). If both become pure black, that lift disappears — the
   natural replacement is **a dither level**, which fits the system nicely. Same logic
   for `--color-tag-active-bg`, `--status-archived-bg`, and `--color-bg-stripes`.
3. **Borders** aren't text — do they have to be pure, or may they stay grey/dithered?
4. **`--color-overlay`** is a translucent black scrim; presumably fine, but confirm.

### Suggested approach

Preview before committing — the existing `/experiments/dither-surfaces` page is the
natural place to add a before/after of the token changes, and the user has consistently
preferred **seeing samples and choosing** over being asked abstract questions.

---

## Useful commands

```bash
npm run generate:dither   # regenerate dither.generated.css (deterministic)
npm run check             # Astro type/diagnostics gate — keep at 0 errors
systemctl --user restart astro-preview.service   # dev server (see CLAUDE.md)
```

Dev routes: `/experiments/dither`, `/experiments/dither-surfaces`
