// Pure logic for the old-URL redirect map (issue #70).
//
// The site used to be a Jekyll build whose permalinks are declared in
// `_config.yml` on the `master` branch. Those URLs are years old and are what
// search engines and other people's links still point at, so every one of them
// has to land on something in the Astro site rather than a 404.
//
// This module is the decision half: given (a) the list of markdown paths in
// master's `collections/` tree plus the permalink rules from `_config.yml`, and
// (b) the list of uids in the current `src/content` tree, it decides what each
// old URL should redirect to. It reads nothing, writes nothing and knows
// nothing about git or the filesystem — `scripts/generate-redirects.mjs` is the
// thin applier that feeds it and writes `src/data/redirects.generated.ts`.
//
// Two rules shape the output:
//   1. Every old URL gets a redirect. An old URL that can't be resolved to a
//      card falls back to the closest lens instead of being dropped.
//   2. Every fallback is reported. `RedirectMapReport.unresolved` is the audit
//      trail — the generator prints it and the generated file records it.

import { DEFAULT_BROWSE_LENS_ID } from './lens-registry.ts';

/**
 * Browse-lens fallback for content URLs whose card can't be identified.
 *
 * The ARCHIVE lens, deliberately (issue #81): a reader arriving on a dead old
 * URL is looking for one specific thing, and Newest is a 30-card strip anchored
 * at now — the least likely place to find something written years ago. Built
 * from DEFAULT_BROWSE_LENS_ID rather than hardcoded so this can't drift away
 * from the lens every other fallthrough uses.
 */
export const BROWSE_LENS_FALLBACK = `/lens/${DEFAULT_BROWSE_LENS_ID}`;

/** Home-lens fallback, used for old static pages that have no card equivalent. */
export const HOME_LENS_FALLBACK = '/';

/**
 * How an old URL is matched against the current content tree.
 *
 * - `slug`        — match the old slug against the last segment of any uid.
 * - `story-item`  — as `slug`, but only among uids inside `.../stories/<group>/`.
 * - `story-index` — the landing page of a whole story; resolves to that story's
 *                   first item, since a story folder has no card of its own.
 * - `explicit`    — a hand-declared target (the old static pages). Validated
 *                   against the uid list when it points at `/card/...`.
 */
export type ResolutionStrategy = 'slug' | 'story-item' | 'story-index' | 'explicit';

/** A Jekyll collection's permalink rule, as read from master's `_config.yml`. */
export interface JekyllCollectionRule {
  /** Collection label without the leading underscore, e.g. `posts`, `arctic`. */
  collection: string;
  /** Jekyll permalink template, e.g. `/what/blog/:title`. */
  permalink: string;
  strategy: ResolutionStrategy;
  /**
   * True for `_posts`, whose filenames carry a `YYYY-MM-DD-` prefix that Jekyll
   * strips out of `:title` but which the new uid keeps.
   */
  datedFilenames?: boolean;
}

/** One old URL, together with everything needed to resolve it. */
export interface OldUrl {
  /** Old absolute path, leading slash, never a trailing slash. */
  from: string;
  /** Reporting group — the Jekyll collection name, or `static`. */
  label: string;
  strategy: ResolutionStrategy;
  /** The slug to match (the *file* slug, date prefix and all). */
  slug: string;
  /** Story collection name, for the two story strategies. */
  group?: string;
  /** Target for the `explicit` strategy. */
  target?: string;
  /** Where to send this URL if it can't be resolved. Defaults to the browse lens. */
  fallback?: string;
}

export type ResolutionVia = ResolutionStrategy | 'fallback';

export interface Resolution {
  from: string;
  to: string;
  label: string;
  via: ResolutionVia;
  /** Only set when `via === 'fallback'`. */
  reason?: string;
  /** Only set for an ambiguous match — the uids that tied. */
  candidates?: string[];
}

/**
 * An old URL that fell back *only* because the card it names is unreachable —
 * drafted, archived, or scheduled for later. The card still exists in the
 * content tree, so unlike the rest of `unresolved` this one has somebody to
 * blame, and un-drafting that card fixes the URL.
 *
 * Decided by resolving twice: once against the reachable uids (what the real
 * map is built from) and once against every uid in the tree. A URL that fails
 * the first and succeeds the second was orphaned by its own card's status.
 */
export interface OrphanedOldUrl {
  /** The card that would have caught this URL if it were reachable. */
  uid: string;
  from: string;
  /** Where the URL goes instead, i.e. the fallback lens. */
  to: string;
}

export interface RedirectMapReport {
  /** Config-ready `from → to` map, key-sorted. */
  redirects: Record<string, string>;
  resolved: Resolution[];
  /** Every entry that fell back. Never empty-by-omission — this is the report. */
  unresolved: Resolution[];
  /**
   * The subset of `unresolved` traceable to an existing-but-unreachable card.
   * Empty when `buildRedirectMap` is called without `allUids`.
   */
  orphaned: OrphanedOldUrl[];
  stats: {
    total: number;
    resolved: number;
    unresolved: number;
    byLabel: Record<string, { total: number; resolved: number; unresolved: number }>;
  };
}

// ---------------------------------------------------------------------------
// Static pages
// ---------------------------------------------------------------------------

/**
 * The old site's hand-written pages (`/who`, `/what`, … plus `/cv`, `/podcast`,
 * `/obs`, `/ice`, `/help`). These aren't collection documents, so there's no
 * slug to resolve — each one is an editorial judgement about the nearest thing
 * in the new site, declared here as data and validated against the uid list by
 * `resolveOldUrl` (a `/card/…` target whose uid has gone away falls back and is
 * reported, exactly like a missing slug).
 *
 * The five `/who` `/what` `/when` `/where` `/why` pages were the dimension
 * landing pages; the new site has no per-dimension lens, so they go to the home
 * lens except where a card genuinely stands in for them.
 */
export const STATIC_PAGE_REDIRECTS: readonly OldUrl[] = [
  { from: '/who', label: 'static', strategy: 'explicit', slug: '', target: '/card/who/about-me', fallback: HOME_LENS_FALLBACK },
  { from: '/what', label: 'static', strategy: 'explicit', slug: '', target: HOME_LENS_FALLBACK, fallback: HOME_LENS_FALLBACK },
  { from: '/when', label: 'static', strategy: 'explicit', slug: '', target: BROWSE_LENS_FALLBACK, fallback: HOME_LENS_FALLBACK },
  { from: '/where', label: 'static', strategy: 'explicit', slug: '', target: HOME_LENS_FALLBACK, fallback: HOME_LENS_FALLBACK },
  { from: '/why', label: 'static', strategy: 'explicit', slug: '', target: HOME_LENS_FALLBACK, fallback: HOME_LENS_FALLBACK },
  { from: '/cv', label: 'static', strategy: 'explicit', slug: '', target: '/card/who/about-me', fallback: HOME_LENS_FALLBACK },
  { from: '/podcast', label: 'static', strategy: 'explicit', slug: '', target: HOME_LENS_FALLBACK, fallback: HOME_LENS_FALLBACK },
  // `/obs` was itself a Jekyll redirect page (layout: redirect) pointing at a
  // Drive folder — preserved verbatim rather than pointed at the new site.
  {
    from: '/obs',
    label: 'static',
    strategy: 'explicit',
    slug: '',
    target: 'https://drive.google.com/drive/folders/1BIuuqsW2uFCa7Iw0fj4vQjJA5L_9nsA9?usp=sharing',
    fallback: HOME_LENS_FALLBACK,
  },
  { from: '/ice', label: 'static', strategy: 'explicit', slug: '', target: HOME_LENS_FALLBACK, fallback: HOME_LENS_FALLBACK },
  { from: '/help', label: 'static', strategy: 'explicit', slug: '', target: HOME_LENS_FALLBACK, fallback: HOME_LENS_FALLBACK },
];

// ---------------------------------------------------------------------------
// Slug normalisation
// ---------------------------------------------------------------------------

const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}-/;
// Story items were renumbered in the migration: `1-1-glacier` → `02-glacier`.
// Both an old two-part ordinal and a new single ordinal are stripped.
const ORDINAL_PREFIX = /^\d+-(\d+-)?/;

/**
 * Reduces a path segment to the identity it shares across the migration:
 * date prefix, ordinal prefix, case and punctuation all removed.
 *
 * Punctuation is dropped because several old slugs ran their words together
 * (`gottagetouttathisspace` → `gotta-get-outta-this-space`). That is lossy on
 * purpose; ambiguity it creates is caught by the ambiguous-match check in
 * `resolveOldUrl` rather than resolved by guessing.
 */
export function slugKey(segment: string): string {
  return segment
    .toLowerCase()
    .replace(DATE_PREFIX, '')
    .replace(ORDINAL_PREFIX, '')
    .replace(/[^a-z0-9]/g, '');
}

// ---------------------------------------------------------------------------
// Jekyll permalink expansion
// ---------------------------------------------------------------------------

export interface PermalinkVars {
  collection: string;
  /** Document path relative to the collection dir, extension stripped. */
  path: string;
  /** Jekyll's `:title` — the file basename, minus any date prefix for posts. */
  title: string;
}

/** Expands a Jekyll permalink template. Output never has a trailing slash. */
export function applyPermalink(template: string, vars: PermalinkVars): string {
  const expanded = template
    .replace(/:collection/g, vars.collection)
    .replace(/:path/g, vars.path)
    .replace(/:title/g, vars.title);
  const trimmed = expanded.replace(/\/+$/, '');
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

// ---------------------------------------------------------------------------
// Enumeration
// ---------------------------------------------------------------------------

const COLLECTION_PATH = /^collections\/_([^/]+)\/(.+)\.(md|markdown)$/;

/**
 * Turns master's `collections/` file listing into the set of old URLs, using
 * the permalink rules from `_config.yml`. Files in collections with no rule
 * (`output: false`, or a collection with no files that were ever published) are
 * skipped, as are non-markdown files.
 */
export function enumerateOldUrls(paths: readonly string[], rules: readonly JekyllCollectionRule[]): OldUrl[] {
  const byCollection = new Map(rules.map(r => [r.collection, r]));
  const seen = new Set<string>();
  const out: OldUrl[] = [];

  for (const filePath of paths) {
    const match = COLLECTION_PATH.exec(filePath);
    if (!match) continue;
    const [, collection, rest] = match;
    const rule = byCollection.get(collection);
    if (!rule) continue;

    // Jekyll's `:path` for a collection document is the path relative to the
    // collection dir without the extension; a `foo/index.md` document is served
    // at `/…/foo/` (with `index.html` inside), so the suffix comes off.
    const docPath = rest.replace(/\/index$/, '');
    const basename = rest.split('/').pop()!;
    const slug = basename === 'index' ? docPath.split('/').pop()! : basename;
    const title = rule.datedFilenames ? slug.replace(DATE_PREFIX, '') : slug;

    const from = applyPermalink(rule.permalink, { collection, path: docPath, title });
    if (seen.has(from)) continue;
    seen.add(from);

    // A story *item* belongs to the story named by its collection (`_arctic`);
    // a story *index* names the story in its own slug (`_places/arctic`).
    const group =
      rule.strategy === 'story-item' ? collection : rule.strategy === 'story-index' ? slug : undefined;

    out.push({ from, label: collection, strategy: rule.strategy, slug, ...(group ? { group } : {}) });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

const CARD_PREFIX = '/card/';

function cardUrl(uid: string): string {
  return `${CARD_PREFIX}${uid}`;
}

function storyScope(group: string): string {
  return `/stories/${group}/`;
}

function fallbackOf(old: OldUrl): string {
  return old.fallback ?? BROWSE_LENS_FALLBACK;
}

function fail(old: OldUrl, reason: string, candidates?: string[]): Resolution {
  return {
    from: old.from,
    to: fallbackOf(old),
    label: old.label,
    via: 'fallback',
    reason,
    ...(candidates ? { candidates } : {}),
  };
}

/**
 * Decides where one old URL should go. Never throws and never returns nothing:
 * an unresolvable URL comes back with `via: 'fallback'` and a `reason`, which
 * is what makes it show up in the report instead of disappearing.
 */
export function resolveOldUrl(old: OldUrl, uids: readonly string[]): Resolution {
  const hit = (to: string): Resolution => ({ from: old.from, to, label: old.label, via: old.strategy });

  if (old.strategy === 'explicit') {
    const target = old.target;
    if (!target) return fail(old, 'no explicit target declared');
    if (target.startsWith(CARD_PREFIX)) {
      const uid = target.slice(CARD_PREFIX.length);
      if (!uids.includes(uid)) return fail(old, `no such card: ${uid}`);
    }
    return hit(target);
  }

  if (old.strategy === 'story-index') {
    const scope = storyScope(old.group ?? old.slug);
    const items = uids.filter(uid => uid.includes(scope)).sort();
    if (items.length === 0) return fail(old, `no story items found under *${scope}`);
    return hit(cardUrl(items[0]));
  }

  const key = slugKey(old.slug);
  const scoped =
    old.strategy === 'story-item'
      ? uids.filter(uid => uid.includes(storyScope(old.group ?? '')))
      : uids;
  const candidates = scoped.filter(uid => slugKey(uid.split('/').pop()!) === key).sort();

  if (candidates.length === 0) {
    // A story item that's gone (or unreachable) has a closer landing spot than
    // a lens: the start of the story it belonged to. Still counted as a
    // fallback, so it stays in the report.
    if (old.strategy === 'story-item' && scoped.length > 0) {
      return {
        ...fail(old, `no match for slug "${old.slug}"; sent to the start of the "${old.group}" story`),
        to: cardUrl([...scoped].sort()[0]),
      };
    }
    return fail(old, `no match for slug "${old.slug}"`);
  }
  if (candidates.length > 1) return fail(old, `ambiguous slug "${old.slug}"`, candidates);
  return hit(cardUrl(candidates[0]));
}

/**
 * Resolves every old URL and assembles the config-ready map plus the report.
 * The map is key-sorted so regenerating it produces a stable diff.
 *
 * `uids` is the *reachable* set — the map must never aim at a URL that 404s.
 * `allUids` additionally includes unreachable cards, and is used only to
 * attribute fallbacks to the card that caused them (see OrphanedOldUrl).
 * Omitting it yields an empty `orphaned` list rather than a wrong one.
 */
export function buildRedirectMap(
  oldUrls: readonly OldUrl[],
  uids: readonly string[],
  allUids?: readonly string[],
): RedirectMapReport {
  const resolutions = oldUrls.map(old => resolveOldUrl(old, uids));

  const orphaned: OrphanedOldUrl[] = [];
  if (allUids) {
    for (const [i, resolution] of resolutions.entries()) {
      if (resolution.via !== 'fallback') continue;
      const retry = resolveOldUrl(oldUrls[i], allUids);
      // An ambiguous or still-missing retry names no single card, so there is
      // nobody to attribute the fallback to.
      if (retry.via === 'fallback' || !retry.to.startsWith(CARD_PREFIX)) continue;
      orphaned.push({
        uid: retry.to.slice(CARD_PREFIX.length),
        from: resolution.from,
        to: resolution.to,
      });
    }
  }

  const redirects: Record<string, string> = {};
  for (const r of [...resolutions].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))) {
    // A redirect to itself would be an infinite meta-refresh loop; drop the
    // pathological case rather than emit it.
    if (r.to === r.from) continue;
    redirects[r.from] = r.to;
  }

  const byLabel: RedirectMapReport['stats']['byLabel'] = {};
  for (const r of resolutions) {
    const bucket = (byLabel[r.label] ??= { total: 0, resolved: 0, unresolved: 0 });
    bucket.total++;
    if (r.via === 'fallback') bucket.unresolved++;
    else bucket.resolved++;
  }

  const unresolved = resolutions.filter(r => r.via === 'fallback');

  return {
    redirects,
    resolved: resolutions.filter(r => r.via !== 'fallback'),
    unresolved,
    orphaned,
    stats: {
      total: resolutions.length,
      resolved: resolutions.length - unresolved.length,
      unresolved: unresolved.length,
      byLabel,
    },
  };
}
