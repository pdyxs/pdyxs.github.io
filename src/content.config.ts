import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

// ─── Shared primitives ────────────────────────────────────────────────────────

const action = z.object({
    text: z.string(),
    url: z.string(),
});

const quote = z.object({
    quote: z.string(),
    by: z.string().optional(),
    in: z
        .object({
            text: z.string(),
            url: z.string(),
        })
        .optional(),
});

// ─── Unified content collection ───────────────────────────────────────────────
//
// All markdown content lives under src/content/, rooted at the filter
// dimension it belongs to (e.g. src/content/what/posts/about-me/index.md).
// A card's uid is its full path relative to src/content/ (entry.id) — the
// first segment is the dimension, the rest (minus the file's own slug) is
// the dimension value (see derivePathTags in tag-inheritance.ts). Every card
// is a folder with an index.md plus its colocated assets. Per-directory
// _config.yaml files set renderer defaults; individual files can override
// any field in their frontmatter.

const content = defineCollection({
    loader: glob({ pattern: "**/[!_]*.{md,mdx}", base: "./src/content" }),
    schema: z.object({
        // ── common ──
        title: z.string().optional(),
        description: z.string().optional(),
        tags: z.array(z.string()).default([]),
        date: z.coerce.date().optional(),
        // ── generated-tag overrides ──
        // Bare travel-log location path (e.g. "europe/norway/svalbard") that
        // overrides the date-derived where:* tag for this card (see the travel
        // generator in src/lib/filter-generators.ts). Also settable per-folder
        // via _config.yaml, where it cascades nearest-wins. Use for content
        // posted long after the trip it's about. The reserved value "none"
        // suppresses the derived where:* tag entirely (for cards whose date
        // carries no meaningful location); a nearer real path overrides it back.
        location: z.string().optional(),
        // Bare `when` path (e.g. "seethrough/2013/06") that overrides the
        // date-derived when:<era>/<year>/<month> tag for this card (see the
        // date/era generator in src/lib/filter-generators.ts). Also settable
        // per-folder via _config.yaml, where it cascades nearest-wins. The
        // reserved value "none" suppresses the derived when:* tag entirely.
        // Named `era` (not `when`) so it never reads as a raw dimension tag —
        // it is the override knob, mirroring how `location` feeds `where`.
        era: z.string().optional(),
        renderer: z.string().optional(),
        // Nav renderer name (owns the card shell + custom navigation, e.g.
        // series prev/next). Cascades via _config.yaml like `renderer`; keyed
        // by name in NAV_RENDERERS (src/lib/renderers.ts). Undeclared → plain
        // card shell (no nav renderer).
        navRenderer: z.string().optional(),
        // Publish-lifecycle status. Absent means "published" (existing content
        // is untouched). Cascades via _config.yaml nearest-wins, like
        // `renderer` (folder default is "published"). See
        // computeStatusVisibility (src/lib/status-visibility.ts) for the pure
        // rules and getAllCards() (src/lib/cards.ts) for how frontmatter and
        // the folder cascade are resolved together. Only `draft`/`published`
        // are enforced so far (issue #46); `scheduled`/`unlisted`/`archived`
        // are declared here so #47/#48 can add their enforcement without a
        // schema change.
        status: z.enum(['draft', 'published', 'scheduled', 'unlisted', 'archived']).optional(),
        // bare filename → resolved against the entry's own directory via
        // resolveLocalImage() (src/lib/images.ts); full URL → rendered as-is.
        // Not image(): this field is shared with posts/puzzles, which store
        // plenty of legacy remote URLs that image() would eagerly (and
        // fatally) try to resolve as local assets.
        image: z.string().optional(),
        // ── posts / writing ──
        canonical_url: z.url().optional(),
        source: z.string().optional(),
        project: z.string().optional(),
        // ── projects ──
        cvDescription: z.string().optional(),
        priority: z.number().optional(),
        feature: z.string().optional(),
        medium: z.string().optional(),
        actions: z.array(action).default([]),
        quotes: z.array(quote).default([]),
        images: z.array(z.string()).default([]),
        portfolio: z.string().optional(),
        // ── stories ──
        series: z.string().optional(),
        order: z.number().optional(),
        icon: z.string().optional(),
        published: z.boolean().optional(),
        map: z.string().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        scale: z.number().optional(),
        // ── work ──
        when: z.string().optional(),
        roles: z.string().optional(),
        // ── puzzles ──
        url: z.url().optional(),
        sudokupad_url: z.url().optional(),
        difficulty: z.string().optional(),
        puzzle_type: z.string().optional(),
        // ── cards ──
        panel: z.boolean().optional(),
        titleSuffix: z.string().optional(),
        // Per-location responsive width (issue #27): a plain CSS length/expr
        // (e.g. "900px") that overrides the global --max-width default for
        // this card in both card mode and page mode. Undeclared → falls back
        // to the site default.
        width: z.string().optional(),
    }),
});

// ─── Export ───────────────────────────────────────────────────────────────────
//
// The `tag` collection retired (see decisions/DEC-006-tag-registry) in favour
// of a build-time tag registry (src/lib/tag-registry.ts) that aggregates
// container `_config.yaml` identities, `<name>.tag.yaml` declarations, card
// titles, and tags actually used on content — read from the filesystem
// rather than a content collection, since the content glob above is
// markdown-only.

export const collections = { content };
