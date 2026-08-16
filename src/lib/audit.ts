// Pure content-audit decision core for the dev-only `audit` lens (issue #72).
//
// This is INSTRUMENTATION, not a fixer: it turns "does everything render and is
// it tagged right?" into a worklist with counts that fall as content work lands.
// The audit lens is the observable surface; this module is the decision.
//
// Rule of thumb inherited from src/lib/content-links.test.ts: a finding that
// should NEVER recur belongs in a test (absolute self-links, dangling `card:`
// targets — already guarded there); a finding that is a *content worklist*
// belongs here. Nothing in this file duplicates content-links.test.ts.
//
// Kept side-effect-free (no IO, no astro:content, no filesystem) so it's unit
// tested against plain data — see "decisions are pure, effects are thin" in
// CLAUDE.md. AuditLensBody.astro is the thin gatherer/renderer around it.

import { resolveDescription } from './description';

export type AuditFindingType =
  | 'dead-image-host'
  | 'missing-title'
  | 'missing-date'
  | 'no-description'
  | 'legacy-markup'
  | 'no-authored-tags'
  | 'unresolved-local-image'
  | 'orphaned-old-url'
  | 'not-inspected';

/**
 * A card as the audit sees it: resolved metadata plus the raw material the
 * findings need (body text, frontmatter media fields, colocated asset names).
 * Everything is optional except `uid` — an absent field is itself auditable.
 */
export interface AuditCard {
  /** Dimension-rooted content path, e.g. "what/writing/a-particular-vision". */
  uid: string;
  /** Resolved display title (see resolveCardTitle) — '' or absent is a finding. */
  title?: string;
  /**
   * The card's description *before* body-excerpt fallback: frontmatter
   * `description` or the folder's `cardDescriptionParts` template output.
   * Passing an already-excerpted value is harmless — resolveDescription is
   * idempotent over its own output (a hand-written value wins immediately).
   */
  description?: string;
  date?: Date;
   /**
   * Tags the card itself declares in its own frontmatter — NOT the merged
   * effective tag list. Path-derived, cascade and generator-derived tags are
   * excluded by construction, which is what makes "no tags beyond derived ones"
   * decidable. Folder-cascade tags are excluded too: they are the folder's
   * statement, not the card's.
   */
  authoredTags?: readonly string[];
  /** Raw frontmatter `image` — a bare colocated filename or a remote URL. */
  image?: string;
  /** Raw frontmatter `images` — same shapes as `image`. */
  images?: readonly string[];
  /** Raw markdown body, frontmatter stripped. */
  body?: string;
  /**
   * Frontmatter `inspected` — has a human read this card end to end since its
   * last change? Absent counts as false, so a brand-new card, or one an
   * automated edit reset (see CLAUDE.md), shows up on the worklist until
   * someone ticks it.
   */
  inspected?: boolean;
  /**
   * Asset filenames that exist alongside the card, relative to its own
   * directory (e.g. "game-jam-1.jpg", "shots/wide.png"). Used to decide whether
   * a local image reference resolves.
   */
  localAssets?: readonly string[];
  /**
   * Old Jekyll URLs that used to land on this card and now fall back to a lens,
   * because the card is unreachable in a production build (`status: draft` /
   * `archived`, or a `scheduled` date not yet reached). Supplied from
   * ORPHANED_OLD_URLS in the generated redirect map — the audit cannot derive
   * it, since it depends on the retired Jekyll site's URL inventory.
   */
  orphanedOldUrls?: readonly string[];
}

/** One card caught by one finding, with the offending values that caught it. */
export interface AuditHit {
  uid: string;
  /** Display label — the card's title, falling back to its uid. */
  title: string;
  /**
   * The specific offending values (URLs, filenames, matched markup). Empty for
   * findings that are simply true or false about the card (missing date, etc.).
   */
  refs: string[];
}

/** All cards caught by a single finding type, with both counts. */
export interface AuditFinding {
  type: AuditFindingType;
  label: string;
  /** One line on what the finding means / what closing it looks like. */
  hint: string;
  cards: AuditHit[];
  /** Number of cards caught. This is the number that must fall to zero. */
  cardCount: number;
  /** Number of individual offending references across those cards. */
  refCount: number;
}

/**
 * Hosts whose images are gone and cannot be re-fetched (recoverable only via
 * the Wayback Machine). Matched against the whole URL rather than the hostname
 * because the seethroughstudios images are served through the `i0/i1/i2.wp.com`
 * Photon proxy, which puts the dead origin in the *path*.
 *
 * Medium (`cdn-images-*.medium.com`) and logic-masters images are LIVE and must
 * not be listed here.
 */
export const DEAD_IMAGE_HOST_PATTERNS: readonly RegExp[] = [
  /seethroughstudios/i,
  /alluremedia/i,
];

/**
 * Jekyll/Medium-era markup that survived the migration into markdown bodies.
 * Deliberately block-level (plus the Liquid tag opener): inline `<a href="card:…">`
 * and `<span>` are legitimate authoring forms in this content set, so matching
 * every `<tag>` would flag hand-written links as leftovers.
 */
export const LEGACY_MARKUP_PATTERNS: readonly RegExp[] = [
  /\{%/g,            // Liquid tag ({% raw %}, {% highlight %}, …)
  /<div\b/gi,        // Bootstrap grid wrappers from the Jekyll theme
  /<center\b/gi,
  /<iframe\b/gi,
  /<table\b/gi,
  /<font\b/gi,
  /<img\b/gi,        // raw <img> — should be markdown so astro:assets can see it
];

const IMAGE_EXTENSION = /\.(jpe?g|png|gif|webp|avif|svg)$/i;
const URL_IN_TEXT = /https?:\/\/[^\s)"'\]<>]+/g;
const MARKDOWN_IMAGE = /!\[[^\]]*\]\(([^)\s]+)/g;

function isRemote(ref: string): boolean {
  return /^https?:\/\//i.test(ref);
}

/** Strips a query string / fragment so an extension test sees the real path. */
function pathPart(ref: string): string {
  return ref.split('#')[0].split('?')[0];
}

function looksLikeImage(ref: string): boolean {
  return IMAGE_EXTENSION.test(pathPart(ref));
}

function frontmatterMediaRefs(card: AuditCard): string[] {
  return [card.image, ...(card.images ?? [])].filter((r): r is string => !!r);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Every image URL the card points at: frontmatter `image`/`images` plus every
 * http(s) URL in the body that ends in an image extension. Body URLs include
 * link *targets* (`[![](thumb.jpg)](https://host/full.jpg)`), which is
 * deliberate — a dead full-size target is as broken as a dead inline image.
 */
export function remoteImageRefs(card: AuditCard): string[] {
  const fromFrontmatter = frontmatterMediaRefs(card).filter(isRemote);
  const fromBody = [...(card.body ?? '').matchAll(URL_IN_TEXT)].map(m => m[0]);
  return [...fromFrontmatter, ...fromBody].filter(looksLikeImage);
}

/**
 * Every local (non-URL) image reference: frontmatter `image`/`images` plus
 * markdown image syntax in the body. Site-absolute refs ("/foo.png") are
 * excluded — they aren't colocated assets and can't be resolved from the card's
 * own directory.
 */
export function localImageRefs(card: AuditCard): string[] {
  const fromFrontmatter = frontmatterMediaRefs(card).filter(r => !isRemote(r));
  const fromBody = [...(card.body ?? '').matchAll(MARKDOWN_IMAGE)]
    .map(m => m[1])
    .filter(r => !isRemote(r));
  // Deliberately NOT filtered through looksLikeImage, unlike remoteImageRefs.
  // Both of these refs are *declared* to be images by where they sit — a
  // frontmatter `image`/`images` entry, or markdown `![](…)` syntax — so an
  // extension tells us nothing we don't already know. Requiring one used to
  // hide the exact refs most likely to be broken: the Jekyll import left 29
  // extension-less stems (`comic-d` for `comic-d.jpg`), which resolve to
  // nothing and render as broken images, and every one of them was filtered
  // out of this check for not looking like an image. remoteImageRefs still
  // needs the filter, because URL_IN_TEXT matches every URL in the body, not
  // just image ones.
  return [...fromFrontmatter, ...fromBody].filter(r => !r.startsWith('/'));
}

/** Normalises a local ref to the form localAssets uses: no "./", no query/hash. */
export function normaliseLocalRef(ref: string): string {
  return decodeURIComponent(pathPart(ref).replace(/^\.\//, ''));
}

// Each detector returns the offending refs when the card is caught, or
// undefined when it's clean. An empty array means "caught, but there's nothing
// to point at" (e.g. a missing date) — which is why this isn't just `string[]`.
type Detector = (card: AuditCard) => string[] | undefined;

interface FindingSpec {
  type: AuditFindingType;
  label: string;
  hint: string;
  detect: Detector;
}

// Display order of the dashboard, most mechanical first.
const FINDING_SPECS: readonly FindingSpec[] = [
  {
    type: 'dead-image-host',
    label: 'Image on a dead external host',
    hint: 'seethroughstudios (via i*.wp.com) and alluremedia are gone — recover from the Wayback Machine and colocate.',
    detect: card => {
      const dead = remoteImageRefs(card).filter(url =>
        DEAD_IMAGE_HOST_PATTERNS.some(p => p.test(url)),
      );
      return dead.length > 0 ? dead : undefined;
    },
  },
  {
    type: 'unresolved-local-image',
    label: 'Local image reference that does not resolve',
    hint: 'The file is not colocated with the card — it will render as a broken image.',
    detect: card => {
      const assets = new Set(card.localAssets ?? []);
      const missing = localImageRefs(card).filter(ref => !assets.has(normaliseLocalRef(ref)));
      return missing.length > 0 ? unique(missing) : undefined;
    },
  },
  {
    type: 'legacy-markup',
    label: 'Liquid or raw HTML leftovers',
    hint: 'Jekyll/Medium-era markup in the body — rewrite as markdown so the renderer owns the layout.',
    detect: card => {
      const body = card.body ?? '';
      const matched = LEGACY_MARKUP_PATTERNS.flatMap(pattern =>
        [...body.matchAll(pattern)].map(m => m[0]),
      );
      return matched.length > 0 ? matched : undefined;
    },
  },
  {
    type: 'orphaned-old-url',
    label: 'Old Jekyll URL now falls back to a lens',
    hint: 'This card is unreachable in a production build, so inbound links to its old URL land on a lens instead. Publish it, or accept the URL is gone.',
    detect: card => {
      const urls = card.orphanedOldUrls ?? [];
      return urls.length > 0 ? [...urls] : undefined;
    },
  },
  {
    type: 'missing-title',
    label: 'Missing title',
    hint: 'No frontmatter `title` and no series fallback — the card has nothing to show in a header.',
    detect: card => (card.title?.trim() ? undefined : []),
  },
  {
    type: 'missing-date',
    label: 'Missing date',
    hint: 'No `date`, so the card cannot be placed on any timeline lens. Some structural cards legitimately have none.',
    detect: card => (card.date ? undefined : []),
  },
  {
    type: 'no-description',
    label: 'No description and no usable excerpt',
    hint: 'resolveDescription yields nothing, so share cards, feed items and browse subtitles come out blank.',
    detect: card =>
      resolveDescription({ description: card.description }, card.body) === undefined
        ? []
        : undefined,
  },
  // The ongoing read-through worklist. Unlike every other finding here it
  // detects nothing about the content itself: it reports a human judgement
  // recorded in frontmatter, kept current by automated edits resetting it
  // (see CLAUDE.md). It sits below the mechanical findings — during the
  // initial pre-launch sweep it catches nearly every card and would bury
  // them — but above `no-authored-tags`, since a read-through naturally
  // precedes tagging. See also src/lib/uninspected-facet.ts, the dev-only
  // `why:uninspected` filter that reads the same flag for combining with
  // other dimensions while browsing.
  {
    type: 'not-inspected',
    label: 'Not yet inspected',
    hint: 'Nobody has read this card end to end yet. Tick `inspected` in Obsidian once you have.',
    detect: card => (card.inspected === true ? undefined : []),
  },
  {
    type: 'no-authored-tags',
    label: 'No tags beyond derived ones',
    hint: 'Every tag on this card comes from its path or a generator — it declares nothing of its own.',
    detect: card => ((card.authoredTags?.length ?? 0) > 0 ? undefined : []),
  },
];

/**
 * The audit: groups every card in the pool by the findings it triggers.
 *
 * Returns one entry per finding type in a fixed order, **including types with
 * zero hits** — the count is the deliverable, and a group that reads `0` is how
 * "done" becomes visible. A card may appear under several findings.
 */
export function auditCards(cards: readonly AuditCard[]): AuditFinding[] {
  return FINDING_SPECS.map(({ type, label, hint, detect }) => {
    const hits: AuditHit[] = [];
    for (const card of cards) {
      const refs = detect(card);
      if (refs === undefined) continue;
      hits.push({ uid: card.uid, title: card.title?.trim() || card.uid, refs });
    }
    return {
      type,
      label,
      hint,
      cards: hits,
      cardCount: hits.length,
      refCount: hits.reduce((sum, hit) => sum + hit.refs.length, 0),
    };
  });
}

/** Total number of cards caught by at least one finding. */
export function auditedCardCount(findings: readonly AuditFinding[]): number {
  return new Set(findings.flatMap(f => f.cards.map(c => c.uid))).size;
}
