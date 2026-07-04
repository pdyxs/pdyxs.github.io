import { defineCollection, z } from "astro:content";
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
// All markdown content lives under src/content/. The first path segment is the
// logical collection name (e.g. posts/about-me → collection "posts", id "about-me").
// Per-directory _config.yaml files set renderer defaults; individual files can
// override any field in their frontmatter.

const content = defineCollection({
    loader: glob({ pattern: "**/[!_]*.{md,mdx}", base: "./src/content" }),
    schema: z.object({
        // ── common ──
        title: z.string().optional(),
        description: z.string().optional(),
        tags: z.array(z.string()).default([]),
        date: z.coerce.date().optional(),
        renderer: z.string().optional(),
        // bare filename → resolved against the entry's own directory via
        // resolveLocalImage() (src/lib/images.ts); full URL → rendered as-is.
        // Not image(): this field is shared with posts/puzzles, which store
        // plenty of legacy remote URLs that image() would eagerly (and
        // fatally) try to resolve as local assets.
        image: z.string().optional(),
        // ── posts / writing ──
        canonical_url: z.string().url().optional(),
        source: z.string().optional(),
        project: z.string().optional(),
        // ── projects ──
        cvDescription: z.string().optional(),
        status: z.enum(["past", "current", "future"]).optional(),
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
        url: z.string().url().optional(),
        sudokupad_url: z.string().url().optional(),
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

// ─── Tag ──────────────────────────────────────────────────────────────────────
//
// Tag metadata for the connective tissue of the card navigation model.
// Each .yaml file's slug is the canonical tag identifier.

const tag = defineCollection({
    loader: glob({ pattern: "**/[!_]*.yaml", base: "./src/content/tag" }),
    schema: z.object({
        name: z.string(),
        aliases: z.array(z.string()).default([]),
        related: z.array(z.string()).default([]),
        description: z.string().optional(),
        featured: z.array(z.string()).default([]),
    }),
});

// ─── Export ───────────────────────────────────────────────────────────────────

export const collections = { content, tag };
