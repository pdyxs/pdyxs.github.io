import { getCollection } from 'astro:content';
import { derivePathTags, mergeEffectiveTags } from './tag-inheritance';
import { resolveFolderCascade, makeFileReader } from './folder-config';
import { generatedTagsForCard, generatorOverrideKeys } from './filter-generators';
import { interpolate } from './interpolate';
import { computeStatusVisibility, isStatusValue } from './status-visibility';
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

const STORIES_PREFIX = 'what/stories/';

/** Resolves a card's display title, applying the stories-fallback-to-series rule. */
export function resolveCardTitle(
  uid: string,
  data: { title?: string; series?: string }
): string {
  return data.title ?? (uid.startsWith(STORIES_PREFIX) ? (data.series ?? '') : '') ?? '';
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

export async function getAllCards(): Promise<CardMeta[]> {
  const allContent = await getCollection('content');

  const reader = makeFileReader();
  const overrideKeys = generatorOverrideKeys();
  const now = new Date();

  const contentMeta = await Promise.all(
    allContent
      .filter(e => e.id.startsWith(STORIES_PREFIX) ? (import.meta.env.DEV || e.data.published !== false) : true)
      .map(async e => {
        const uid = e.id;
        const cascade = await resolveFolderCascade(uid, reader, overrideKeys);

        const title = resolveCardTitle(uid, e.data);
        const description = resolveCardDescription(e.data, cascade.cardDescriptionParts);

        const baseTags = effectiveTags(uid, e.data.tags, cascade.cascadeTags);
        const overrides: Record<string, string | undefined> = {};
        for (const key of overrideKeys) {
          overrides[key] = (e.data as Record<string, unknown>)[key] as string | undefined
            ?? cascade.overrides[key];
        }
        const finalTags = generatedTagsForCard(baseTags, { date: e.data.date, overrides });

        const rawStatus = (e.data as { status?: unknown }).status ?? cascade.status;
        const status: StatusValue = isStatusValue(rawStatus) ? rawStatus : 'published';
        const visibility = computeStatusVisibility(status, e.data.date, { isDev: import.meta.env.DEV, now });

        return {
          uid,
          title,
          description,
          date: e.data.date,
          tags: finalTags,
          renderer: e.data.renderer ?? cascade.renderer ?? 'card',
          image: e.data.image,
          contentHash: computeContentHash(title, description, e.body),
          order: e.data.order,
          status,
          visibility,
        } satisfies CardMeta;
      })
  );

  return contentMeta;
}
