import { getCollection } from 'astro:content';
import { derivePathTags, mergeEffectiveTags } from './tag-inheritance';
import { resolveFolderCascade, makeFileReader } from './folder-config';
import type { FolderCascade } from './folder-config';
import { generatedTagsForCard, generatorOverrideKeys } from './filter-generators';
import { interpolate } from './interpolate';
import { computeStatusVisibility, resolveStatus } from './status-visibility';
import { resolveDescription } from './description';
import type { StatusValue, StatusVisibility } from './status-visibility';

/** Merges a card's path-derived tag, its ancestors' cascade tags, and its own frontmatter tags (in that precedence, deduped). */
function effectiveTags(
  uid: string,
  frontmatterTags: string[],
  cascadeTags: string[],
): string[] {
  return mergeEffectiveTags(
    derivePathTags(uid),
    cascadeTags,
    frontmatterTags,
  );
}

/**
 * The frontmatter fields card *resolution* reads — a structural subset of the
 * content collection's zod-inferred `data`, declared here so resolveCard() can
 * be tested without constructing a full Astro entry. The index signature covers
 * the fields read dynamically: `cardDescriptionParts` templates interpolate
 * against arbitrary frontmatter, and generator override keys are looked up by
 * name (see filter-generators.ts).
 */
export type CardFrontmatter = {
  title?: string;
  description?: string;
  date?: Date;
  tags?: string[];
  renderer?: string;
  navRenderer?: string;
  status?: unknown;
  image?: string;
  order?: number;
  titleSuffix?: string;
  width?: string;
  dateLabel?: string;
  gallery?: boolean;
  [key: string]: unknown;
};

/** The shape resolveCard() resolves from — an Astro content entry, structurally. */
export type CardEntry = {
  id: string;
  data: CardFrontmatter;
  body?: string;
};

/**
 * The impure inputs of resolution, lifted out so resolveCard() stays pure and
 * testable at a fixed clock (which `scheduled` status will need).
 */
export type ResolveContext = {
  /** Generator override keys to cascade — see generatorOverrideKeys(). */
  overrideKeys: string[];
  isDev: boolean;
  now: Date;
};

/**
 * The subset of a resolved card that *every* card has, including ones with no
 * markdown entry behind them — collapse.ts synthesises one of these per
 * collapsed folder. This is the listing model: sitemap, RSS, front-page slots
 * and the browse pool all consume it.
 */
export type CardMeta = {
  uid: string;        // full path relative to content/, e.g. "what/writing/why-portal"
  title: string;
  description?: string;
  date?: Date;
  tags: string[];
  renderer: string;
  /** Raw frontmatter `image` (bare colocated filename or remote URL); resolved to a thumbnail at serialisation time. */
  image?: string;
  contentHash: string; // djb2 hash of title + description + body; resets view state on edit
  /** Sequence within a series/folder (from frontmatter `order`); used to pick
   * a collapsed folder's representative "first" card. Absent for unordered content. */
  order?: number;
  /** Present only on a collapsed-folder representative (see collapse.ts): how
   * many member cards the folder collapsed. Drives the browse-card count badge. */
  collapsed?: { count: number };
  /** Resolved publish-lifecycle status: frontmatter `status` ?? cascaded _config.yaml `status` ?? 'published'. */
  status: StatusValue;
  /** Build-time listing/reachability visibility, computed from `status`/`date`/isDev — see computeStatusVisibility. */
  visibility: StatusVisibility;
};

/**
 * Everything the single-card view needs: a CardMeta plus the three fields only
 * a full card render consumes. Structurally a CardMeta, so every listing
 * consumer accepts one unchanged.
 *
 * Kept off CardMeta deliberately — CardMeta is spread into the browse client's
 * JSON payload, and none of these three mean anything there.
 */
export type ResolvedCard = CardMeta & {
  /** Cascaded nav-shell renderer name (frontmatter, else nearest `_config.yaml`), or undefined for a plain card shell. */
  navRenderer?: string;
  /** Frontmatter `titleSuffix` — rendered by CardHeader after the title. */
  titleSuffix?: string;
  /** Frontmatter `width` — a CSS length overriding the global default for this card. */
  width?: string;
  /**
   * Resolved meaning of this card's date (frontmatter `dateLabel`, else the
   * nearest `_config.yaml`'s). Doubles as the switch for whether a dateline
   * renders at all — see resolveDateline in card-date.ts. Kept off CardMeta
   * because browse listings show a bare date with no label.
   */
  dateLabel?: string;
  /**
   * Whether this card shows an image gallery (frontmatter, else the nearest
   * `_config.yaml`; default true). Kept off CardMeta — a browse listing has no
   * gallery to suppress.
   */
  gallery?: boolean;
};

/**
 * Resolves a card's display title. There is no fallback: a card with no
 * frontmatter `title` renders as ''.
 *
 * (A stories-fallback-to-series rule lived here until #77. It had been dead
 * since stories moved from `what/stories/` to `what/posts/stories/`, and it
 * would have produced the lowercase slug — "arctic", not "Arctic" — if
 * revived. Untitled story chapters get a frontmatter title like their
 * siblings.)
 */
export function resolveCardTitle(data: { title?: string }): string {
  return data.title ?? '';
}

/**
 * Resolves a card's description: the frontmatter `description` if present,
 * otherwise a fallback synthesised from the folder's `cardDescriptionParts`
 * templates (see folder-config.ts). Each part is interpolated against the
 * card's frontmatter and dropped when any of its `{{field}}` references is
 * missing; the surviving parts are joined by ` · `.
 */
export function resolveCardDescription(
  data: { description?: string; [key: string]: unknown },
  cardDescriptionParts?: string[]
): string | undefined {
  if (data.description) return data.description;
  if (cardDescriptionParts && cardDescriptionParts.length > 0) {
    const joined = cardDescriptionParts
      .map(part => interpolate(part, data))
      .filter((s): s is string => !!s)
      .join(' · ');
    return joined || undefined;
  }
  return undefined;
}

function djb2Hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function computeContentHash(title: string, description?: string, body?: string): string {
  return String(djb2Hash(`${title}||${description ?? ''}||${body ?? ''}`));
}

/**
 * Resolves one content entry, against its already-resolved folder cascade, into
 * the card the rest of the site consumes — title, description, tags, renderer,
 * nav renderer, status, visibility and content hash.
 *
 * This is the single place that sequence happens. `CardStackCard.astro` used to
 * re-derive most of it independently for the single-card view, guarded only by
 * comments asserting the two agreed; it now consumes a ResolvedCard produced
 * here (#77), so there is nothing left to keep in sync.
 *
 * Pure and synchronous: the cascade is resolved by the caller (it reads files)
 * and the clock/dev flag arrive in `ctx`, so this is directly unit-testable
 * without Astro. `getAllCards()` is the thin async shell that does the IO.
 */
export function resolveCard(
  entry: CardEntry,
  cascade: FolderCascade,
  ctx: ResolveContext,
): ResolvedCard {
  const { id: uid, data, body } = entry;

  const title = resolveCardTitle(data);
  // Two-stage: the frontmatter/cascade-template description first, then
  // resolveDescription's body excerpt when neither produced anything.
  // This is the ONE place a card's summary is decided — OG/Twitter meta,
  // JSON-LD, RSS and browse-card subtitles all read CardMeta.description
  // (issue #71).
  const description = resolveDescription(
    { description: resolveCardDescription(data, cascade.cardDescriptionParts) },
    body
  );

  const baseTags = effectiveTags(uid, data.tags ?? [], cascade.cascadeTags);
  const overrides: Record<string, string | undefined> = {};
  for (const key of ctx.overrideKeys) {
    overrides[key] = (data[key] as string | undefined) ?? cascade.overrides[key];
  }
  const tags = generatedTagsForCard(baseTags, { date: data.date, overrides });

  const status: StatusValue = resolveStatus(data.status, cascade.status);
  const visibility = computeStatusVisibility(status, data.date, {
    isDev: ctx.isDev,
    now: ctx.now,
  });

  return {
    uid,
    title,
    description,
    date: data.date,
    tags,
    renderer: data.renderer ?? cascade.renderer ?? 'card',
    image: data.image,
    contentHash: computeContentHash(title, description, body),
    order: data.order,
    status,
    visibility,
    navRenderer: data.navRenderer ?? cascade.navRenderer,
    titleSuffix: data.titleSuffix,
    width: data.width ?? cascade.width,
    dateLabel: data.dateLabel ?? cascade.dateLabel,
    gallery: data.gallery ?? cascade.gallery,
  } satisfies ResolvedCard;
}

/** Reads the content collection and resolves every entry — the thin IO shell around resolveCard(). */
export async function getAllCards(): Promise<ResolvedCard[]> {
  const allContent = await getCollection('content');

  const reader = makeFileReader();
  const ctx: ResolveContext = {
    overrideKeys: generatorOverrideKeys(),
    isDev: import.meta.env.DEV,
    now: new Date(),
  };

  return Promise.all(
    allContent.map(async e =>
      resolveCard(e, await resolveFolderCascade(e.id, reader, ctx.overrideKeys), ctx)
    )
  );
}
