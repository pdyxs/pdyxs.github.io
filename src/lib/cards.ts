import { getCollection } from 'astro:content';
import { derivePathTags, mergeEffectiveTags } from './tag-inheritance';
import { resolveFolderCascade, makeFileReader } from './folder-config';
import { TRAVEL_LOG } from '../data/travel-log';
import { lookupLocationForDate, injectWhereTags } from './where-tags';

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
  contentHash: string; // djb2 hash of title + description + body; resets view state on edit
};

const STORIES_PREFIX = 'what/stories/';
const PUZZLES_PREFIX = 'what/puzzles/';

/** Resolves a card's display title, applying the stories-fallback-to-series rule. */
export function resolveCardTitle(
  uid: string,
  data: { title?: string; series?: string }
): string {
  return data.title ?? (uid.startsWith(STORIES_PREFIX) ? (data.series ?? '') : '') ?? '';
}

/** Resolves a card's description, synthesising one from puzzle metadata when absent. */
export function resolveCardDescription(
  uid: string,
  data: { description?: string; puzzle_type?: string; difficulty?: string }
): string | undefined {
  if (uid.startsWith(PUZZLES_PREFIX) && !data.description) {
    return [data.puzzle_type, data.difficulty].filter(Boolean).join(' · ') || undefined;
  }
  return data.description;
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

  const contentMeta = await Promise.all(
    allContent
      .filter(e => e.id.startsWith(STORIES_PREFIX) ? (import.meta.env.DEV || e.data.published !== false) : true)
      .map(async e => {
        const uid = e.id;
        const cascade = await resolveFolderCascade(uid, reader);

        const title = resolveCardTitle(uid, e.data);
        const description = resolveCardDescription(uid, e.data);

        const baseTags = effectiveTags(uid, e.data.tags, cascade.cascadeTags);
        const finalTags = e.data.date
          ? injectWhereTags(baseTags, lookupLocationForDate(e.data.date, TRAVEL_LOG))
          : baseTags;

        return {
          uid,
          title,
          description,
          date: e.data.date,
          tags: finalTags,
          renderer: e.data.renderer ?? cascade.renderer ?? 'card',
          contentHash: computeContentHash(title, description, e.body),
        } satisfies CardMeta;
      })
  );

  return contentMeta;
}
