# Workflow: content authoring, dev reload, experiments

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

## Content is authored in a dedicated Obsidian vault

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

## `inspected` is a permanent editorial flag, not a pre-MVP sweep

`inspected` (`src/content.config.ts`) answers one question forever: has a
human read this card end to end since its last change? It started as a
one-off pre-launch backfill and stayed — the mechanism turned out to be a
general-purpose "something changed this without me looking" signal, useful
long after the initial sweep finishes. Three things read it, and all three
are permanent:

- **`scripts/backfill-inspected.mjs`** stamps `inspected: false` onto any card
  that lacks the key, so Obsidian's Properties view has a checkbox to render.
  Idempotent, run by hand — never wired into `predev`/`prebuild`, since it
  mutates authored content and must never race a concurrent Obsidian edit.
- **The `not-inspected` finding** on the dev-only audit lens (`src/lib/audit.ts`)
  — the flat worklist view, grouped with every other content finding.
- **The dev-only `why:uninspected` filter** (`src/lib/uninspected-facet.ts`) —
  the same flag, but combinable with every other dimension while browsing
  ("uninspected puzzles", "uninspected posts from 2019"), which the flat
  audit list can't do. See that file for why it's deliberately *not* a
  `FilterGenerator`: the value must never receive a stack-manifest short code.

**The rule this drives:** any script, generator or AI agent that changes a
card's frontmatter **or** body — not Paul editing directly in Obsidian — must
set `inspected: false` on that card's frontmatter as part of the same change.
An automated edit is exactly the kind of change nobody has personally read
yet, so it belongs on the worklist the flag already drives. Set it even if the
card was previously ticked `true` — an automated change is new content a
human hasn't seen, regardless of what was reviewed before it.

This does **not** apply to `content: auto-sync` commits that carry Paul's own
edits from Obsidian mobile — those are authored directly by him and need no
re-flagging. It also doesn't apply to `scripts/backfill-inspected.mjs` itself,
which only ever writes `inspected: false` onto a card that has no `inspected`
key at all — that is the one write this rule doesn't cover, since there was
nothing there to have been "read" yet.

New cards from the Templater scaffold are prefilled `inspected: true`, not
left commented out — a card Paul writes himself needs no confirmation of his
own words; the flag is scoped to content something *other than him* touched.

## Experiments live on dev-only routes

`/experiment` should create throwaway pages under `src/pages/experiments/` with synthetic fixtures (e.g. 10 fake cards for an overflow experiment). Don't prototype by mutating production components and reverting.

Note: Astro excludes directories starting with `_` from routing, so `_experiments` does **not** work — use `experiments` (no underscore).

## Plans must name the selectors and CSS variables they touch

Given the selector contract ([stack-layout.md](stack-layout.md)) and the CSS custom property convention ([styling.md](styling.md)), a plan file should explicitly list any new class names it adds to the JS contract and any new CSS variables it introduces. Reviewers and future sessions should see this without re-reading the diff.

