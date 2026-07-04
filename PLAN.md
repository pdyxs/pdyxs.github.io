# Site Rebuild: Jekyll → Astro

> Design philosophy and interaction model: see [DESIGN.md](DESIGN.md)

Complete rebuild of pdyxs.wtf as an Astro site with Obsidian as content editor,
Substack for newsletter, and IndieWeb/federation support.

**Guiding principle:** Site is the source of truth. Everything else (Substack,
Fediverse, social) is distribution on top of it.

---

## Milestone 1: Foundation

Get Astro deploying to pdyxs.wtf via GitHub Actions before touching any content.

- [x] Create Astro project (blank template) in a new branch (`astro-rebuild`)
- [x] Configure `@astrojs/rss` — RSS feed is foundational for Substack cross-posting
- [ ] Set up Cloudflare Pages preview (see below) and verify build pipeline works
- [ ] Add Substack subscribe embed/widget to the site (existing newsletter) ← deferred: need embed code
- [ ] Confirm Substack subscribe flow works from the site
- [ ] Set up GitHub Actions deploy to GitHub Pages when ready to cut over to pdyxs.wtf

**Done when:** A "hello world" Astro site is live at the preview URL, the RSS feed
is live, and the Substack subscribe widget is embedded.

### Preview deployment: Cloudflare Pages

To test without touching the live site, use Cloudflare Pages as a preview environment:

1. Push `astro-rebuild` branch to GitHub
2. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages → Create application → Pages
3. Connect to GitHub → select `pdyxs/pdyxs.github.io` repo
4. Configure build:
   - **Branch:** `astro-rebuild`
   - **Build command:** `npm run build`
   - **Build output:** `dist`
5. Deploy — Cloudflare will give a `*.pages.dev` URL for testing

No DNS changes needed. The live site at pdyxs.wtf is unaffected.

**Cutting over to pdyxs.wtf (when ready):**
- Re-add the GitHub Actions workflow (already written, just deleted for safety)
- In GitHub repo Settings → Pages → Source: set to GitHub Actions
- Update the Cloudflare Pages branch or delete it once Pages is live

---

## Milestone 2: Content Modeling

Define the content collection schemas before migrating any files. This is the
most important design decision — get it right here and everything else follows.

### Collections to define

| Astro collection | Source | Notes |
|---|---|---|
| `posts` | `collections/_posts/` | 127 posts, dates from filenames |
| `projects` | `collections/_pastprojects/` + `_currentprojects/` + `_futureprojects/` | Merge into one collection with `status` field |
| `stories` | `collections/_arctic/`, `_galapagos/`, `_fatecardgame/` | Multi-part sequential format |
| `work` | `collections/_workhistory/` | CV data |

### Key schema decisions

- `posts` schema includes optional `project` field (slug reference to a project)
- `projects` schema includes a query for related posts (by matching slug)
- `stories` have a `series` field and `order` field for sequential navigation
- All content has `tags` for cross-cutting themes

### Obsidian integration

- Content lives at `src/content/` which syncs into Obsidian vault at
  `docs/dev/pdyxs.github.io/src/content/`
- Wikilinks in content: decide convention (avoid them in published content, or
  add a build-step converter)
- Images: establish a path convention that works for both Obsidian preview and
  Astro's image pipeline

**Done when:** Schemas are defined with Zod, validated, and the blog↔project
relationship is modeled and testable with sample data.

---

## Milestone 3: Content Migration

Mechanical migration of existing content into the new schemas.

- [ ] Write a script to migrate `_posts/` — fix frontmatter (remove `layout:`,
  add explicit `date:` from filename, normalise fields)
- [ ] Migrate projects — merge past/current/future into unified collection,
  add `status` field
- [ ] Migrate stories — add `series` and `order` fields, verify sequential nav
  works
- [ ] Migrate work history
- [ ] Audit and fix image paths throughout (most tedious step)
- [ ] Verify URL structure matches existing Jekyll permalinks exactly — don't
  break indexed URLs

**URL compatibility is non-negotiable.** Jekyll post URLs follow
`/year/month/day/title/`. Astro's `getStaticPaths()` must reproduce this exactly.

**Done when:** All content renders at correct URLs, no broken image paths, no
broken internal links.

---

## Milestone 4: Navigation & Site Design — resolved

This milestone was intentionally left open for design work; it's now decided
and built, not a clean slate anymore. The answer that emerged: a **card-stack
navigation model** with a **lens** as the first-class "browse" location —

- The 5W (Who/What/Where/When/Why) structure came back, but as a *filter*
  dimension (`src/lib/filters.ts`), not a nav dropdown — content carries
  `dimension:value` tags and any view can narrow by them.
- The home lens (`src/lib/lens-registry.ts`, `home` entry) is the homepage;
  "browse" is a lens family (concrete sort lenses under a shared grid, e.g.
  `newest`) that a filter can pre-narrow. See issue #26 (browse lens +
  retiring the old per-collection pages) and #23 (lens as a stack location).
- Cards push/collapse in a stack (`CardStack.svelte`) rather than navigating
  between separate pages — the "explore vs. arrived from a specific post"
  question is answered by that shared stack: every entry point (home, a
  post, a filtered browse) is a location on the same stack.
- Bootstrap was never introduced; styling is CSS custom properties
  end-to-end (see `global.css` design tokens).

**Done:** navigation design decided and implemented; mobile behaviour is
covered by the CSS-first-responsive convention (see project CLAUDE.md).

---

## Milestone 5: Layouts & Components

Build the Astro layouts and components for each content type.

- [x] Base layout (head, nav, footer) — `src/layouts/Base.astro`
- [x] Blog post layout — with related project surfacing if `project:` field set
- [x] Project page layout — with related posts listed
- [x] Blog index / archive — superseded by the browse lens pre-filtered to
  `what:posts` (issue #26), not a standalone archive page
- [x] Portfolio index — filterable by status and tags — superseded by the
  browse lens: any `dimension:value` filter (including `what:projects`) narrows
  it in place (issue #26); there's no separate filterable portfolio page
- [x] Story/series layout — sequential chapter navigation (prev/next within
  series) — `SeriesNavRenderer` (`NAV_RENDERERS.stories`)
- [x] CV/work history page — `WorkRenderer`
- [x] Homepage — the home lens (issue #24: folded `index.astro` into the home
  lens; resolved by Milestone 4 above)

**Done:** every content type has a working layout with correct
cross-references between posts and projects.

---

## Milestone 6: Interactive Features

Astro islands for anything that needs client-side JS.

- [ ] D3 visualizations — wrap existing D3 v5 code in island components with
  `client:load`; upgrade to D3 v7 while touching it
- [ ] Any other JS-dependent features (galleries, carousels if kept)
- [ ] Remove jQuery entirely — nothing in the new site should depend on it
- [ ] Lazy loading on all images (`loading="lazy"`)
- [ ] Confirm D3 is only loaded on pages that actually use it

**Done when:** All interactive features work, no jQuery, D3 only loads where needed.

---

## Milestone 7: IndieWeb & Federation

Add the infrastructure for federation and content ownership.

- [ ] Ensure RSS feed is complete (full content, not excerpts)
- [ ] Add Webmention endpoint via webmention.io (add `<link>` in `<head>`)
- [ ] Add microformats2 markup to post pages (`h-entry`, `h-card`)
- [ ] Display received webmentions on post pages (fetch from webmention.io API)
- [ ] Register with Bridgy Fed → Fediverse presence at `@pdyxs.wtf@pdyxs.wtf`
- [ ] Set Bluesky handle to `@pdyxs.wtf` (DNS TXT record or `/.well-known/atproto-did`)
- [ ] Add JSON-LD structured data to posts and project pages
- [ ] Confirm Substack posts link back canonically to pdyxs.wtf
- [ ] Decide cross-posting workflow: manual copy-paste vs. using Substack's import or API

**Done when:** Site is discoverable and followable from Mastodon, Bluesky handle
is set, webmentions are received and displayed, Substack newsletters link back
canonically.

---

## Milestone 8: Polish & Performance

- [ ] WebP images with fallbacks (Astro's `<Image>` component handles this)
- [ ] Audit and remove unused assets (the `/svgs/` directory has ~28K items)
- [ ] Replace Google Analytics with something privacy-respecting (Fathom, Plausible,
  or self-hosted) — or remove entirely
- [ ] FontAwesome → upgrade to v6 or replace with inline SVGs
- [ ] SEO audit: canonical URLs, Open Graph, Twitter Card, sitemap
- [ ] Accessibility audit: alt text, ARIA labels, keyboard navigation
- [ ] Print styles for CV page

**Done when:** Lighthouse scores are good, no obvious accessibility gaps,
analytics decision made.

---

## Decisions deferred to design time

These are noted here so they don't get forgotten, but shouldn't block early milestones:

- **Homepage design** — carousel vs. something simpler; what leads
- **Nav structure** — replacement for Who/What/Where/When/Why
- **Styling approach** — Bootstrap 5 vs. CSS custom properties from scratch
- **Wikilink convention** — avoid in published content, or add build-step conversion
- **Lab/experiments section** — a `/lab` for front-end experiments; worth adding
  once the core site is stable

---

## What's explicitly out of scope

- Migrating the contact form (evaluate separately when needed)
- The podcast section (evaluate separately)
- The `/obs` and `/ice` sections (evaluate separately)
- Full Substack cross-posting automation — start manual, automate later if needed
- Migrating existing Substack subscriber list or post history into the site
