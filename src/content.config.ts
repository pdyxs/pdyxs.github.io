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
    values: z.array(z.string()).nullable().default([]).transform((v) => v ?? []),
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
        // Obsidian's Properties panel writes a bare `tags:` (YAML null) when
        // every item is cleared from a List property, rather than `tags: []`
        // or removing the key — `.nullable()` absorbs that; `.default([])`
        // alone only covers a missing key, not an explicit null.
        tags: z
            .array(z.string())
            .nullable()
            .default([])
            .transform((v) => normaliseAuthoredTags(v ?? [])),
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
        // Derivation control. `location:`/`era:` used to live here as "derive
        // this instead" knobs; issue #116 retired both, so redirecting a
        // derivation is now authoring the tag you want plus excluding the one
        // you don't. The asymmetry is deliberate — an authored tag ADDS where
        // those keys REPLACED, and a card sitting in two places at once is
        // often right for a post written up long after the fact.
        //
        //   tags:
        //     - where/europe/norway/svalbard   # the one you want
        //     - generated/location             # re-enable, if a folder excluded it
        //   excludeTags:
        //     - generated/location             # drop the date-derived one
        //
        // A `generated/<name>` entry in `tags:` re-enables a derivation an
        // ancestor `_config.yaml` excluded, and is stripped before the tag
        // list goes anywhere — it names no filter value. Re-enable beats
        // exclude wherever each was declared, because exclusions accumulate
        // down the cascade and a nearer-wins rule would make the escape hatch
        // unable to escape. A `generated/*` name no generator declares is a
        // BUILD ERROR in either field.
        //
        // Tags this card should NOT carry, in two forms (see
        // src/lib/exclude-tags.ts). Also settable per-folder via _config.yaml,
        // where — unlike `location`/`era` above — it ACCUMULATES rather than
        // nearest-wins: an exclusion is a statement about one tag, so a card
        // naming its own has not withdrawn its folder's.
        //
        //   excludeTags:
        //     - why/playable          # this value, whoever proposed it
        //     - generated/location    # whatever the location derivation proposed
        //
        // `generated/<name>` names a derivation (`location`, `era`,
        // `difficulty`, `playable`, `buyable`) and is the robust form: it says
        // "no location" without needing to know what the travel log currently
        // derives, so shifting a date range cannot silently un-suppress the
        // card. A `generated/*` entry naming no real key is a BUILD ERROR — a
        // suppression knob that fails open would be invisible.
        //
        // Anything else is a tag value, prefix-matching on segment boundaries
        // (`where/europe` drops any European derivation). It can only remove a
        // GENERATED tag: authored tags are unvetoable by construction, so you
        // write the tag or the veto and the two can never contradict. An entry
        // that removes nothing is surfaced as the `inert-derivation-control` audit
        // finding — the value form is the half that can go stale silently.
        //
        // Issue #116 folded five ad-hoc knobs into this one field: `location:
        // none`, `era: none`, and `playable`/`viewable`/`buyable: never`. There
        // is deliberately no "force it on" counterpart: authoring the tag IS
        // that, which is why `viewable: always` became `tags: [why/viewable]`
        // and why `location:`/`era:` could be retired outright.
        excludeTags: z.array(z.string()).nullable().optional().transform((v) => v ?? undefined),
        // Manual "a human has read this card end to end" flag. Obsidian's
        // Properties view only renders a checkbox for a key that actually
        // exists in the file — scripts/backfill-inspected.mjs stamps it onto
        // any card that lacks it (idempotent, safe to re-run). Absence counts
        // the same as `false` everywhere this is read.
        //
        // Not a one-off: any automated edit to a card's frontmatter or body —
        // a script, a generator, an AI agent — must reset this to `false` as
        // part of that edit (see CLAUDE.md, "An automated edit to a card
        // re-flags it `inspected: false`"). It also drives the dev-only
        // `why:uninspected` filter (src/lib/uninspected-facet.ts), and the
        // `not-inspected` finding on the dev-only audit lens (src/lib/audit.ts).
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
        meta: z.array(metaRow).nullable().default([]).transform((v) => v ?? []),
        actions: z.array(action).nullable().default([]).transform((v) => v ?? []),
        quotes: z.array(quote).nullable().default([]).transform((v) => v ?? []),
        images: z.array(z.string()).nullable().default([]).transform((v) => v ?? []),
        portfolio: z.string().optional(),
        // ── stories ──
        series: z.string().optional(),
        order: z.number().optional(),
        // The in-world/trip date this chapter depicts — deliberately separate
        // from `date` (the publish date, which feeds when:*/sort/RSS/the
        // dateLabel dateline). Auto-migrated story chapters often carry a
        // `date` that is an artificial weekly publish cadence with no relation
        // to when the trip actually happened; `storyDate` is what a series'
        // date bar (see computeSeriesDateBar in src/lib/series.ts) reads.
        storyDate: z.coerce.date().optional(),
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
        // Names a custom island to render *instead of* this card's header
        // image — see HEADER_MEDIA_RENDERERS in src/lib/renderers.ts. Only the
        // media at the top of the card is replaced; the masthead, body,
        // gallery and card strips are unaffected. Frontmatter-only and
        // deliberately non-cascading: a bespoke header belongs to one card.
        // An unregistered name silently falls back to the plain `image:`.
        headerMedia: z.string().optional(),
        // `false` suppresses this card's image gallery. Normally set per-folder
        // in _config.yaml, where it cascades nearest-wins like `renderer`.
        gallery: z.boolean().optional(),
        // Per-location responsive width (issue #27): a plain CSS length/expr
        // (e.g. "900px") that overrides the global --max-width default for
        // this card in both card mode and page mode. Undeclared → falls back
        // to the site default.
        width: z.string().optional(),
        // Whether a series card shows the calendar-style date bar (see
        // SeriesDateBar.astro / computeSeriesDateBar). Normally set per-folder
        // in _config.yaml, where it cascades nearest-wins like `renderer`.
        // Requires `storyDate` on the series' chapters — without it the bar
        // has nothing to plot and renders nothing.
        dateBar: z.boolean().optional(),
        // How a series' sibling run previews on this card: 'strip' (default —
        // the full-thumbnail "In this series" CardStrip, unchanged), 'dots' (a
        // compact position strip shown above the content instead), or 'none'.
        // Normally set per-folder in _config.yaml, where it cascades
        // nearest-wins like `renderer`. Independent of `navRenderer` — see
        // CLAUDE.md's nav-renderer section.
        seriesPreview: z.enum(['strip', 'dots', 'none']).optional(),
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
