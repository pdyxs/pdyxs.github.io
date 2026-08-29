import { getCollection } from 'astro:content';
import { resolveCardTitle } from './card-title';
export { resolveCardTitle };
import { derivePathTags, mergeEffectiveTags } from './tag-inheritance';
import { resolveFolderCascade, makeFileReader } from './folder-config';
import type { FolderCascade } from './folder-config';
import {
  generateTagsForCard,
  generatorDerivations,
  generatorFrontmatterKeys,
} from './filter-generators';
import { applyReEnables, parseExcludeTags, partitionGeneratedTags } from './exclude-tags';
import { resolveActions, type ActionSource } from './card-actions';
import { computeAffiliationTags } from './affiliations';
import { discoverAffiliations, discoverTagPriorities } from './tag-registry';
import { interpolate } from './interpolate';
import { computeStatusVisibility, resolveStatus } from './status-visibility';
import { resolveDescription } from './description';
import { resolveCardPriority, tagPrioritySum, type TagPriorities } from './priority';
import { DEFAULT_FOLDER_SORT, resolveSortValue, type FolderSort } from './folder-sort';
import { withUninspectedTag } from './uninspected-facet';
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
  /** Authored `excludeTags` — see exclude-tags.ts for the two forms. */
  excludeTags?: string[];
  renderer?: string;
  navRenderer?: string;
  status?: unknown;
  image?: string;
  order?: number;
  priority?: number;
  difficulty?: string;
  /** Has a human read this card end to end since its last edit? See
   * src/lib/uninspected-facet.ts for the dev-only `why:uninspected` filter it
   * drives, and src/lib/audit.ts for the `not-inspected` finding. */
  inspected?: boolean;
  titleSuffix?: string;
  width?: string;
  dateLabel?: string;
  gallery?: boolean;
  dateBar?: boolean;
  seriesPreview?: 'strip' | 'dots' | 'none';
  [key: string]: unknown;
};

/** The shape resolveCard() resolves from — an Astro content entry, structurally. */
export type CardEntry = {
  id: string;
  data: CardFrontmatter;
  body?: string;
};

/**
 * The tag-generation half of resolution, shared by resolveCard() and the audit
 * lens.
 *
 * Extracted only because the audit deliberately reads raw entries rather than
 * resolved cards (see AuditLensBody.astro) and still needs to ask which of a
 * card's `excludeTags` came to nothing. Keeping one copy means the finding can
 * never disagree with what actually happened to the tags.
 */
function generationInputs(
  uid: string,
  data: CardFrontmatter,
  cascade: FolderCascade,
  frontmatterKeys: string[],
) {
  const derivations = generatorDerivations();

  // `generated/<name>` entries ride in on `tags` and are pulled straight back
  // out: they are directives, not tags. Validated here, so a typo is a build
  // error rather than a card silently keeping whatever a folder excluded.
  const { tags: baseTags, reEnabled } = partitionGeneratedTags(
    effectiveTags(uid, data.tags ?? [], cascade.cascadeTags),
    derivations,
    uid,
  );

  const overrides: Record<string, string | undefined> = {};
  for (const key of frontmatterKeys) {
    overrides[key] = (data[key] as string | undefined) ?? cascade.overrides[key];
  }

  // Card frontmatter and every ancestor `_config.yaml`, unioned — see the
  // excludeTags field on FolderCascade for why this list accumulates. Then the
  // re-enables are subtracted, once, before any generator runs: a re-enabled
  // derivation is simply not suppressed, so there is no ordering for a
  // generator to get wrong.
  const declared = parseExcludeTags(
    [...cascade.excludeTags, ...(data.excludeTags ?? [])],
    derivations,
    uid,
  );
  const exclude = applyReEnables(declared, reEnabled);

  // What THIS FILE declares, for the inert finding below. An inherited entry is
  // judged against the folder, not against each card under it.
  const own = parseExcludeTags(data.excludeTags ?? [], derivations);
  const ownReEnabled = partitionGeneratedTags(data.tags ?? [], derivations).reEnabled;

  // The affordance generator reads *resolved* actions, not `data.actions`, so
  // the puzzle fields resolveActions folds into a play link count exactly as
  // an authored `kind: play` row does — one fold, decided in one place.
  const generated = generateTagsForCard(baseTags, {
    date: data.date,
    overrides,
    exclude,
    actions: resolveActions(data as ActionSource),
  });

  // A re-enable that undid no exclusion did nothing, and the author should be
  // told — the same reasoning as an inert exclusion, and the same finding.
  const inertReEnables = [...ownReEnabled]
    .filter(key => !declared.suppressed.has(key))
    .map(key => `generated/${key}`);

  // ONLY what this card's own frontmatter declares is reported.
  //
  // A folder-level exclusion is routinely a no-op for *some* of its cards while
  // being load-bearing for the rest, and the author can do nothing about that
  // without breaking the rest. `what/posts/stories/arctic` is the live case: it
  // excludes `generated/location` and pins Svalbard, and for the 9 posts dated
  // inside the Svalbard travel-log range the derivation would have produced
  // that very tag — so the exclusion removes nothing *there*, while still being
  // the only thing keeping the 13 posts written up in August out of Quito and
  // Peru. Reported per-card, that is 9 worklist entries with no available
  // action. Whether a folder's entry is inert for EVERY card under it is a
  // different question, and a pool-level one this per-card audit is not shaped
  // to ask.
  const ownEntries = new Set([
    ...own.vetoes,
    ...[...own.suppressed].map(key => `generated/${key}`),
  ]);

  return {
    ...generated,
    inert: [...generated.inert.filter(entry => ownEntries.has(entry)), ...inertReEnables],
  };
}

/**
 * Which of this card's derivation-control entries did nothing — the
 * `inert-derivation-control` audit finding. Covers both an `excludeTags` entry
 * that removed nothing and a `generated/*` tag that re-enabled nothing.
 * Returned in the authored form, so the entry can be found in the file it was
 * written in.
 */
export function inertDerivationControls(
  uid: string,
  data: CardFrontmatter,
  cascade: FolderCascade,
  frontmatterKeys: string[] = generatorFrontmatterKeys(),
): string[] {
  return generationInputs(uid, data, cascade, frontmatterKeys).inert;
}

/**
 * The impure inputs of resolution, lifted out so resolveCard() stays pure and
 * testable at a fixed clock (which `scheduled` status will need).
 */
export type ResolveContext = {
  /** Generator-read frontmatter fields to cascade — see generatorFrontmatterKeys(). */
  frontmatterKeys: string[];
  isDev: boolean;
  now: Date;
  /** Declared `.tag.yaml` priorities, by filter value — see priority.ts. */
  tagPriorities?: TagPriorities;
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
  /**
   * How far up the ranking this card is pushed — the SUM of its own
   * frontmatter `priority`, every ancestor folder's, and every `.tag.yaml`'s
   * for a tag it carries. Negative pushes down; 0 is neutral. The one
   * cascading key that accumulates: see priority.ts for the rule and why the
   * name kept its misleading singular.
   */
  priority: number;
  /**
   * This card's folder-declared sort, with this card's own value for its key
   * already resolved (rung 5 of the ranking chain — see ranking.ts). Resolved
   * at build so the comparator never re-reads what `difficulty` means, and so
   * the client payload carries one primitive instead of four fields.
   */
  sort: FolderSort & { value?: number | string };
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
  /**
   * Whether this series card shows the calendar-style date bar (frontmatter,
   * else the nearest `_config.yaml`). Undefined/false → no bar, whether or
   * not `storyDate` data exists. Kept off CardMeta — a browse listing has
   * nowhere to put a date bar.
   */
  dateBar?: boolean;
  /**
   * How this series' sibling run previews (frontmatter, else the nearest
   * `_config.yaml`; consumers default undefined to 'strip'). Kept off
   * CardMeta for the same reason as `dateBar`.
   */
  seriesPreview?: 'strip' | 'dots' | 'none';
};


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

  const { tags } = generationInputs(uid, data, cascade, ctx.frontmatterKeys);
  // Dev-only, and deliberately not a FilterGenerator — see
  // uninspected-facet.ts for why it can't go through the same allValues()/
  // manifest path as the others.
  const tagsWithFacets = withUninspectedTag(tags, data.inspected, ctx.isDev);

  const sort = cascade.sort ?? DEFAULT_FOLDER_SORT;

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
    tags: tagsWithFacets,
    renderer: data.renderer ?? cascade.renderer ?? 'card',
    image: data.image,
    contentHash: computeContentHash(title, description, body),
    order: data.order,
    priority: resolveCardPriority(
      { uid, own: data.priority, cascade: cascade.priority, tags },
      ctx.tagPriorities,
    ),
    sort: {
      ...sort,
      value: resolveSortValue(sort.key, { date: data.date, difficulty: data.difficulty, order: data.order, title }),
    },
    status,
    visibility,
    navRenderer: data.navRenderer ?? cascade.navRenderer,
    titleSuffix: data.titleSuffix,
    width: data.width ?? cascade.width,
    dateLabel: data.dateLabel ?? cascade.dateLabel,
    gallery: data.gallery ?? cascade.gallery,
    dateBar: data.dateBar ?? cascade.dateBar,
    seriesPreview: data.seriesPreview ?? (cascade.seriesPreview as ResolvedCard['seriesPreview']),
  } satisfies ResolvedCard;
}

/**
 * Reads the content collection and resolves every entry — the thin IO shell
 * around resolveCard().
 *
 * The affiliation pass afterwards is the one thing resolveCard() can't do: a
 * `who:*` affiliation is a fixed point over the whole pool's tags (see
 * affiliations.ts), so it can only be decided once every card has resolved. It
 * stays a *merge* onto the already-resolved tags — the decision itself is pure
 * and lives in computeAffiliationTags.
 */
export async function getAllCards(): Promise<ResolvedCard[]> {
  const allContent = await getCollection('content');

  const reader = makeFileReader();
  const ctx: ResolveContext = {
    frontmatterKeys: generatorFrontmatterKeys(),
    isDev: import.meta.env.DEV,
    now: new Date(),
    tagPriorities: await discoverTagPriorities(),
  };

  const cards = await Promise.all(
    allContent.map(async e =>
      resolveCard(e, await resolveFolderCascade(e.id, reader, ctx.frontmatterKeys), ctx)
    )
  );

  const declarations = await discoverAffiliations();
  if (declarations.length === 0) return cards;

  // Membership is computed over the *whole* pool, hidden cards included: a
  // draft card is still a real link in the chain, and dropping it here would
  // silently break the closure behind it.
  const affiliations = computeAffiliationTags(declarations, cards);
  return cards.map(card => {
    const extra = affiliations.get(card.uid);
    if (!extra) return card;
    return {
      ...card,
      tags: mergeEffectiveTags(card.tags, extra),
      // An affiliation is a `.tag.yaml` value like any other, so a priority
      // declared on one applies to the members it just reached. resolveCard
      // couldn't have seen these tags — they only exist once the closure runs
      // over the whole pool — so the sum is topped up rather than recomputed.
      priority: card.priority + tagPrioritySum(card.uid, extra, ctx.tagPriorities ?? {}),
    };
  });
}
