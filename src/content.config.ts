import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";
import { ACTION_KINDS } from "./lib/card-actions";
import { CONTENT_GLOB_PATTERN } from "./lib/content-glob";
import { normaliseAuthoredTags } from "./lib/five-w";

// ─── Shared primitives ────────────────────────────────────────────────────────

// A "go do it" link in a card's masthead band. `text` is however the author
// wants it worded; `kind` is what it *is* — see ACTION_KINDS in
// src/lib/card-actions.ts for the five values and the rulings between them.
// The `why:*` filter generators read `kind` and never the label, so an
// unkinded action renders normally but contributes no affordance tag.
const action = z.object({
    text: z.string(),
    url: z.string(),
    kind: z.enum(ACTION_KINDS).optional(),
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

// A credit/fact row on a card ("Medium: Video Game", "Accolades: …"). Ported
// from the Jekyll site's open-ended `definitions:` list — the label set is a
// long tail (22 distinct labels across 25 cards, most used once), so this stays
// a list rather than becoming named schema fields.
//
// Deliberately ONE shape, with no unions and no variants, so it maps onto a
// Metadata Menu fileClass:
//
//     meta    Object List
//     ├ label Input
//     └ values Multi
//
// Metadata Menu declares a single static shape per Object List item, so a
// `string | {text, url}` union or a `value`-vs-`values` variant would be
// unrepresentable — the plugin would have to pick one and the other authoring
// style would fall outside what it can render. Hence: `values` is always a list
// of plain strings, and a link is written as an ordinary markdown link inside
// the string (`[Libby Heaney](http://libbyheaney.co.uk/)`), which is the native
// Obsidian authoring idiom anyway. parseMetaItems (card-meta.ts) pulls the
// links back out at render time.
const metaRow = z.object({
    label: z.string(),
    values: z.array(z.string()).default([]),
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
    loader: glob({ pattern: CONTENT_GLOB_PATTERN, base: "./src/content" }),
    schema: z.object({
        // ── common ──
        title: z.string().optional(),
        description: z.string().optional(),
        // Authored in Obsidian's nested-tag form (`where/work/seethrough`) and
        // normalised to the canonical `where:work/seethrough` here — this
        // transform is one of the two boundaries between the two forms (the
        // other is the `_config.yaml` cascade in resolveFolderCascade). See
        // normaliseAuthoredTag in src/lib/five-w.ts for why.
        tags: z
            .array(z.string())
            .default([])
            .transform(normaliseAuthoredTags),
        date: z.coerce.date().optional(),
        // How far up the "Most* Interesting" ranking this card is pushed
        // (issue #80). Negative pushes it down; absent is neutral.
        //
        // ─── READ THIS: `priority` is ADDITIVE, and it is the only key that is.
        // Every other cascading key — `renderer`, `navRenderer`, `status`,
        // `width`, `gallery`, `dateLabel`, `sort` — is nearest-wins: the
        // deepest declaration replaces the ones above it. `priority` instead
        // SUMS this frontmatter value, every ancestor folder's `_config.yaml`
        // value, and the value on every `<tag>.tag.yaml` for a tag this card
        // carries. (A folder counts once, as an ancestor — never a second time
        // as a filter value.) Nothing in the name says so; see
        // src/lib/priority.ts and CLAUDE.md.
        //
        // Convention, not enforced: hundreds move a folder as a block, ones
        // sort within it.
        //
        // Zod strips unknown keys, so `priorty:` would be silently ignored —
        // src/lib/priority-frontmatter.test.ts fails the build instead.
        priority: z.number().optional(),
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
        // The three `why:*` affordances, each `always` or `never`, overriding
        // what the affordance generator derives for this card (see
        // src/lib/why-tags.ts). Also settable per-folder via _config.yaml,
        // where they cascade nearest-wins.
        //
        // These are the escape hatch for the two ways a derivation can be
        // wrong: `always` for the visual art card whose write-up is too long
        // for the "short body" signal, `never` for the play link that leads
        // somewhere no longer playable. Each key names its value, so a card
        // that is two of the three says so twice — there is no combined field.
        playable: z.enum(['always', 'never']).optional(),
        viewable: z.enum(['always', 'never']).optional(),
        buyable: z.enum(['always', 'never']).optional(),
        // TEMPORARY (pre-MVP): manual "I have eyeballed this card" flag. Set on
        // every card by scripts/backfill-inspected.mjs so Obsidian's Properties
        // view renders it as a checkbox on every post; tick it as you go and
        // watch the `not-inspected` count on the dev-only audit lens fall to
        // zero. Delete this field, the finding in src/lib/audit.ts and the
        // backfill script together once the sweep is done.
        inspected: z.boolean().optional(),
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
        // the folder cascade are resolved together. All five values are
        // enforced: `published` (listed + reachable), `unlisted` (reachable
        // only), `draft`/`archived` (neither), `scheduled` (neither until its
        // `date` is reached at build time, then as `published`). Note every
        // rule is bypassed under `isDev`, so status only takes effect in a
        // production build.
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
        // Legacy shorthands for what are now `meta` rows — resolveMetaRows folds
        // them in at the front, so a card must not carry both.
        medium: z.string().optional(),
        meta: z.array(metaRow).default([]),
        actions: z.array(action).default([]),
        quotes: z.array(quote).default([]),
        images: z.array(z.string()).default([]),
        portfolio: z.string().optional(),
        // ── stories ──
        series: z.string().optional(),
        order: z.number().optional(),
        icon: z.string().optional(),
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
        // Whitespace to add around the header image, as a length ("5%", "40px";
        // a percentage resolves against the image's longer side). Consumed only
        // by `npm run pad:images`, which rewrites the file on disk from the
        // unpadded original it keeps at <card>/_original/ — nothing reads this
        // field at runtime. Remove it (or set 0) and the next run puts the
        // original back. See src/lib/image-padding.ts.
        //
        // Declared in the puzzles section, though it works on any card: the
        // logic-masters exports are cropped flush to their content, so this is
        // the only folder where it is routinely needed, and the section is what
        // keeps it out of every other folder's Templater scaffold.
        imagePad: z.string().optional(),
        // ── cards ──
        panel: z.boolean().optional(),
        titleSuffix: z.string().optional(),
        // What this card's date *means* — "Published", "Released", … Almost
        // every card has a `date` (it feeds the when:* tags and sort order), so
        // presence says nothing; declaring a label is what makes a dateline
        // show, and says how to word it. Normally set per-folder in
        // _config.yaml, where it cascades nearest-wins like `renderer`; the
        // reserved value "none" suppresses an inherited label. See
        // resolveDateline in src/lib/card-date.ts.
        dateLabel: z.string().optional(),
        // `false` suppresses this card's image gallery. Normally set per-folder
        // in _config.yaml, where it cascades nearest-wins like `renderer`.
        gallery: z.boolean().optional(),
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
