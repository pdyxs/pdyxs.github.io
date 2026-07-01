import { getCollection } from 'astro:content';
import { load as parseYaml } from 'js-yaml';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { derivePathTags, loadDefaultsTags, mergeEffectiveTags } from './tag-inheritance';
import { TRAVEL_LOG } from '../data/travel-log';
import { lookupLocationForDate, injectWhereTags } from './where-tags';

const CONTENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../content');

function makeFileReader() {
  const cache = new Map<string, string | null>();
  return async (path: string): Promise<string | null> => {
    if (cache.has(path)) return cache.get(path)!;
    try {
      const text = await readFile(resolve(CONTENT_DIR, path), 'utf-8');
      cache.set(path, text);
      return text;
    } catch {
      cache.set(path, null);
      return null;
    }
  };
}

async function effectiveTags(
  collection: string,
  id: string,
  frontmatterTags: string[],
  reader: (path: string) => Promise<string | null>
): Promise<string[]> {
  return mergeEffectiveTags(
    derivePathTags(collection, id),
    await loadDefaultsTags(collection, id, reader),
    frontmatterTags,
  );
}

async function loadCollectionConfig(
  collection: string,
  reader: (path: string) => Promise<string | null>
): Promise<{ renderer?: string }> {
  const text = await reader(`${collection}/_config.yaml`);
  if (!text) return {};
  return (parseYaml(text) as { renderer?: string } | null) ?? {};
}

export type CardMeta = {
  uid: string;        // "collection/id", e.g. "writing/why-portal"
  collection: string;
  id: string;
  title: string;
  description?: string;
  date?: Date;
  tags: string[];
  renderer: string;
  contentHash: string; // djb2 hash of title + description + body; resets view state on edit
};

export function getCardsForTag(
  entry: { id: string; data: { name: string; aliases: string[] } },
  allCards: CardMeta[]
): CardMeta[] {
  const canonicals = new Set([
    entry.id,
    entry.data.name.toLowerCase(),
    ...entry.data.aliases.map((a: string) => a.toLowerCase()),
  ]);

  return allCards
    .filter(c => c.tags.some(t => canonicals.has(t.toLowerCase())))
    .sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.getTime() - a.date.getTime();
    });
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
  const [allContent, tags] = await Promise.all([
    getCollection('content'),
    getCollection('tag'),
  ]);

  const reader = makeFileReader();

  // Pre-load _config.yaml per collection directory
  const collectionNames = [...new Set(allContent.map(e => e.id.split('/')[0]))];
  const configMap = new Map<string, { renderer?: string }>();
  await Promise.all(collectionNames.map(async col => {
    configMap.set(col, await loadCollectionConfig(col, reader));
  }));

  const contentMeta = await Promise.all(
    allContent
      .filter(e => {
        const col = e.id.split('/')[0];
        return col !== 'stories' || import.meta.env.DEV || e.data.published !== false;
      })
      .map(async e => {
        const slashIdx = e.id.indexOf('/');
        const collection = e.id.slice(0, slashIdx);
        const id = e.id.slice(slashIdx + 1);
        const config = configMap.get(collection) ?? {};

        const title = e.data.title ?? (collection === 'stories' ? (e.data.series ?? '') : '');
        let description = e.data.description;
        if (collection === 'puzzles' && !description) {
          description = [e.data.puzzle_type, e.data.difficulty].filter(Boolean).join(' · ') || undefined;
        }

        const baseTags = await effectiveTags(collection, id, e.data.tags, reader);
        const finalTags = e.data.date
          ? injectWhereTags(baseTags, lookupLocationForDate(e.data.date, TRAVEL_LOG))
          : baseTags;

        return {
          uid: e.id,
          collection,
          id,
          title,
          description,
          date: e.data.date,
          tags: finalTags,
          renderer: e.data.renderer ?? config.renderer ?? 'card',
          contentHash: computeContentHash(title, description, e.body),
        } satisfies CardMeta;
      })
  );

  const tagsMeta = tags.map(t => ({
    uid: `tag/${t.id}`,
    collection: 'tag',
    id: t.id,
    title: t.data.name,
    description: t.data.description,
    tags: [] as string[],
    renderer: 'tag',
    contentHash: computeContentHash(t.data.name, t.data.description),
  }));

  return [...contentMeta, ...tagsMeta];
}
