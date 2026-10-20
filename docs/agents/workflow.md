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
`src/lib/site/dev-reload.ts`; the plugin only watches, debounces, spawns and signals.
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
  (`src/lib/content/folders/content-glob.ts`), which excludes underscore-prefixed *directories*
  as well as underscore-prefixed files. Put anything similar under a `_`-folder.
- Pasted images arrive colocated in the card folder as plain markdown
  (`![](file.png)`), by vault setting — never assume a wikilink converter.
- The Templater scaffolds in `src/content/_templates/` are **generated** — one per
  container folder, by `scripts/generate-card-templates.mjs` (decisions in
  `src/lib/site/templater-scaffold.ts`), wired into `predev`/`prebuild`. Never hand-edit
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
- **The `not-inspected` finding** on the dev-only audit lens (`src/lib/site/audit.ts`)
  — the flat worklist view, grouped with every other content finding.
- **The dev-only `why:uninspected` filter** (`src/lib/content/tags/uninspected-facet.ts`) —
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

## Where a module lives, and which import idiom it uses

`src/lib` and `src/components` are foldered by what the code is *about*, not by
kind. Tests sit beside the module they cover, `*.island.test.ts` keeps that exact
filename wherever it lands (the vitest project split is by filename, not path —
see [testing.md](testing.md)).

```
src/lib/
├── stack/     state/   the stack as data: codec, manifest, fragments, read state, URL params
│   └──        layout/  the stack as geometry: fan placement, motion, reservation, skeleton
├── content/   cards/   resolveCard and everything it decides
│   ├──        folders/ the `_config.yaml` cascade, content roots, uids, globs
│   └──        tags/    the five-w dimensions, tag registry, generators, affiliations
├── browse/    lenses/  the lens registry, keys, chrome, icons, strip/history lenses
│   ├──        results/ the browse pool, ranking, cards, reveal
│   └──        home/    the home lens's slot grid and day-seeded selection
├── render/             renderers and what a card body composes: images, embeds, actions
└── site/               whole-site output: seo, sitemap, rss, redirects, promotion, audit
```

```
src/components/
├── stack/            CardStack and the card shell around it
├── browse/           BrowseCard / BrowseResults / BrowseSkeleton / CardStrip
├── filters/          the filter panel, its buttons and chips, LensFilterShell, LensIcon
├── media/            ImageGallery, Lightbox, InlineImageViewer
├── lens/             the lens page shells (LensPage, LensStackCard)
├── card-renderers/   registered in COLLECTION_RENDERERS / NAV_RENDERERS, plus the series pieces
├── lens-renderers/   registered in LENS_BODY_LOADERS
├── header-media/     bespoke masthead renderers
└── site/             page chrome (ThemeToggle)
```

**Two import idioms live here, and the split is forced rather than chosen.**

- **Aliases** — `@stack/*`, `@content/*`, `@browse/*`, `@render/*`, `@site/*`,
  `@components/*`, `@stores/*`, `@dimensions`, `@data/*` — for everything
  resolved by Vite: Astro, both vitest projects, `svelte-check`. Declared in
  `tsconfig.json`.
- **Relative paths with an explicit `.ts` extension** for every module in the
  closure reachable from `scripts/*.mjs`. Those scripts run under plain Node
  type-stripping (the `engines` floor is 22.18), and Node honours neither
  tsconfig paths nor extensionless specifiers. An alias import added anywhere in
  that closure breaks a generator **at runtime**, not at build — `npm run build`
  and `npm test` both pass, and `npm run generate:*` throws. The closure is
  currently ~40 of the `src/lib` modules; if a module already imports its
  siblings with `.ts` on the end, it is in the closure and must stay that way.

`vitest.island.config.ts` is a plain Vite config with no Astro plugin, so it
reads no tsconfig paths: the alias list is restated there by hand as
`resolve.alias`. Adding an alias means adding it in both places.

**The closure is guarded, and it has to be, because every check you would think
to run goes through Vite.** `src/lib/site/script-import-closure.test.ts` parses
the `../src/…` imports out of every `scripts/*.mjs` and loads each one in a
plain `node -e` subprocess — so the entry set is derived rather than listed (a
new script import is covered with no edit to the test) and the transitive depth
is covered by Node itself (an import added *below* an entry fails too). It
catches more than aliases: any top-level `import.meta.env`, any `.astro`
import, any extensionless specifier.

The live example is `lens-body-keys.ts`, a deliberate leaf now sitting directly
beside `lens-components.ts` in `browse/lenses/`. That neighbour spreads
`import.meta.env.DEV` at the top level, which Vite substitutes and Node leaves
undefined — so folding the four-string key list into it, an attractive tidy now
that the two are siblings, passes `npm run build`, passes `astro check`, passes
every other test, and fails only when `predev` next runs the generator. The
scripts themselves are deliberately never imported by the test, only read: most
have a top-level `main()`, and importing `pad-card-images.mjs` re-pads
committed images.

## Experiments live on dev-only routes

`/experiment` should create throwaway pages under `src/experiments/` with synthetic fixtures (e.g. 10 fake cards for an overflow experiment). Don't prototype by mutating production components and reverting.

They are served at `/experiments/<name>` (index at `/experiments`, which lists them with the first `//` comment of each page's frontmatter as its blurb) by `scripts/experiments-integration.mjs`, which injects the routes **only under `astro dev`** — nothing in `src/experiments/` reaches a production build. The folder is scanned at server start, so a *new* experiment needs `systemctl --user restart astro-preview.service`; edits to existing ones hot-reload.

They sit outside `src/pages/` on purpose: a file in `pages/` is always built, and Astro excludes `_`-prefixed directories from routing, so neither `pages/experiments` nor `pages/_experiments` can be dev-only.

## The build server (`build.pdyxs.wtf`)

`build.pdyxs.wtf` serves the **real production build** (`astro build` output in
`dist/`, via `astro preview` on port 4322), not the dev server. Use it to tell
a dev-server-only artefact from a real bug: CSS code-splitting, fragment
styling and anything else `astro dev` papers over behave as they will live.

Two user systemd units:

- `astro-build.service` runs `npm run build` and stamps `dist/build-info.txt`
  with the UTC time and short commit. `astro-build.timer` fires it periodically.
- `astro-build-preview.service` serves `dist/`.

To refresh it with the latest code of this checkout:

```
systemctl --user start astro-build.service           # rebuild dist/
systemctl --user restart astro-build-preview.service # serve it
cat dist/build-info.txt                              # confirm the commit
```

The build reads the working tree, so commit (or at least save) first. A feature
worktree has no build server of its own; its preview is `astro dev` only.

## Plans must name the selectors and CSS variables they touch

Given the selector contract ([stack-layout.md](stack-layout.md)) and the CSS custom property convention ([styling.md](styling.md)), a plan file should explicitly list any new class names it adds to the JS contract and any new CSS variables it introduces. Reviewers and future sessions should see this without re-reading the diff.


## Feature worktrees

**This checkout (`~/dev/pdyxs-astro`) stays on `dev`, always.** It is the content
vault, the source of `preview.pdyxs.wtf`, and where small fixes and ordinary
features land. Content auto-sync skips every tick while it is on any other
branch, so checking out a feature branch here silently stops content commits.

Substantial work with design unknowns — the kind that is hand-tuned for weeks
after it is first built (the palette and mark, Particulars) — goes in a
worktree instead, via `site-worktree` (`~/server-project/scripts/`):

```
site-worktree new <id>     # ~/dev/pdyxs-astro.wt/<id> on feature/<id>, preview at https://<id>.preview.pdyxs.wtf
site-worktree list         # every worktree, its branch and preview URL
site-worktree rm <id>      # stop the preview, remove the worktree (branch kept)
```

`new` reuses `feature/<id>` if it exists, local or remote. Every day
`worktree-sync` (`~/server-project/scripts/`) merges `dev` into each worktree and
pushes; Claude resolves conflicts, and only a genuine either/or reaches the Build
room. It skips a worktree with any uncommitted file, so leaving work uncommitted
is how to keep it out of the way. Work on the feature
from a session started in the worktree directory.

A worktree feature ships with **a sample piece of content** that demonstrates
it, so its preview has something to show. It lives in the worktree's own
`src/content` (the content vault Obsidian opens is the main checkout's, not
the worktree's). It may be throwaway; if an agent wrote it, it carries
`inspected: false` like any other automated content edit.

The worktree preview runs `astro dev` only. The production build is checked at
merge.

### Merging a worktree feature

Only when Paul says so.

1. In the worktree, merge `dev` in (it has moved on, including content) and
   resolve conflicts there, never in the main checkout.
2. `npm test` and `npm run build` in the worktree. The build is the first
   production-fidelity check this feature gets, so a failure here is expected
   to be possible, not a formality.
3. Decide the sample content: delete it if it was throwaway, otherwise keep it
   as real content with `status: draft`.
4. In the main checkout (on `dev`): `git merge --no-ff feature/<id>` and push.
5. `site-worktree rm <id>`, then delete `feature/<id>` locally and on `origin`.
