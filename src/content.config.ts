import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// ─── Shared primitives ────────────────────────────────────────────────────────

const action = z.object({
  text: z.string(),
  url: z.string(),
});

const quote = z.object({
  quote: z.string(),
  by: z.string().optional(),
  in: z.object({
    text: z.string(),
    url: z.string(),
  }).optional(),
});

// ─── Posts ────────────────────────────────────────────────────────────────────
//
// Source: collections/_posts/
// URL pattern: /YYYY/MM/DD/slug/ (must match Jekyll permalinks exactly)

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    // date is always explicit in frontmatter (not inferred from filename)
    date: z.coerce.date(),
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
    // image: URL or relative path
    image: z.string().optional(),
    // canonical_url: original URL when post was cross-posted from Medium etc.
    canonical_url: z.string().url().optional(),
    // source: platform the post originated on (e.g. 'medium')
    source: z.string().optional(),
    // project: slug of a related project in the projects collection
    project: z.string().optional(),
  }),
});

// ─── Projects ─────────────────────────────────────────────────────────────────
//
// Source: collections/_pastprojects/, _currentprojects/, _futureprojects/
// Merged into one collection; status field replaces the directory split.
// Each project is a directory with a single .md file (the content).

const projects = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    // cvDescription: longer description for the CV page
    cvDescription: z.string().optional(),
    status: z.enum(['past', 'current', 'future']),
    tags: z.array(z.string()).default([]),
    // priority: YYYYMMDD-style number used for ordering (higher = more recent)
    priority: z.number().optional(),
    // image: primary image filename (relative to project directory)
    image: z.string().optional(),
    // feature: image to use in featured/hero contexts if different from image
    feature: z.string().optional(),
    // medium: type of project e.g. 'Video Game', 'Card Game', 'App'
    medium: z.string().optional(),
    actions: z.array(action).default([]),
    quotes: z.array(quote).default([]),
    // images: ordered gallery (filenames or URLs)
    images: z.array(z.string()).default([]),
    // portfolio: featured media URL (YouTube embed etc.) for portfolio view
    portfolio: z.string().optional(),
  }),
});

// ─── Stories ──────────────────────────────────────────────────────────────────
//
// Source: collections/_arctic/, _galapagos/, _fatecardgame/
// Multi-part sequential content. Each chapter is a directory with an index.md.
// series + order drive prev/next navigation.

const stories = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/stories' }),
  schema: z.object({
    // title is optional: map cards and other non-text cards may not have one
    title: z.string().optional(),
    // series: matches the source collection name ('arctic', 'galapagos', 'fatecardgame')
    series: z.string(),
    // order: chapter position within the series (0-indexed, from filename prefix)
    order: z.number(),
    date: z.coerce.date().optional(),
    icon: z.string().optional(),
    published: z.boolean().optional(),
    // map card fields
    map: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    scale: z.number().optional(),
  }),
});

// ─── Work ─────────────────────────────────────────────────────────────────────
//
// Source: collections/_workhistory/
// CV / work history entries. Ordered by priority (YYYYMM).

const work = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/work' }),
  schema: z.object({
    title: z.string(),
    // when: human-readable date range e.g. 'February 2015–May 2018'
    when: z.string().optional(),
    // roles: comma-separated roles e.g. 'Designer, Product Owner, Developer'
    roles: z.string().optional(),
    // priority: YYYYMM number for ordering (higher = more recent)
    priority: z.number().optional(),
    image: z.string().optional(),
  }),
});

// ─── Tags ─────────────────────────────────────────────────────────────────────
//
// Tag metadata for the connective tissue of the card navigation model.
// Each .yaml file's slug is the canonical tag identifier.
//
// Tag links in content point to a tag slug rather than a specific card.
// At render time, the system resolves a tag link to the highest-priority card
// for that tag, using the `featured` list first, then falling back to
// content `priority` fields.
//
// Aliases let content authors use variant spellings freely — the migration
// script normalises all tag references to canonical slugs, but aliases
// also provide a runtime fallback for any that slip through.

const tags = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/tags' }),
  schema: z.object({
    // canonical display name (slug is the file name, e.g. 'quantum-computing')
    name: z.string(),
    // aliases: other names/spellings that resolve to this tag
    // e.g. ['quantum', 'quantum computing', 'QC']
    aliases: z.array(z.string()).default([]),
    // related: slugs of other tags for tag-to-tag traversal in navigation
    related: z.array(z.string()).default([]),
    description: z.string().optional(),
    // featured: ordered content IDs to surface first when resolving a tag link.
    // Format: 'collection/slug', e.g. 'projects/particulars', 'posts/why-portal'
    // If empty, falls back to the content item with the highest priority value.
    featured: z.array(z.string()).default([]),
  }),
});

// ─── Export ───────────────────────────────────────────────────────────────────

export const collections = { posts, projects, stories, work, tags };
