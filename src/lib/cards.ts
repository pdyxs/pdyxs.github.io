import { getCollection } from 'astro:content';
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

// Default renderer per collection — override per-card with `renderer` in frontmatter
export const COLLECTION_DEFAULTS: Record<string, string> = {
  cards: 'card',
  posts: 'post',
  projects: 'project',
  puzzles: 'puzzle',
  stories: 'story',
  work: 'work',
  tag: 'tag',
};

export type CardMeta = {
  uid: string;        // "collection/id", e.g. "posts/why-portal"
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

function resolveRenderer(collection: string, data: { renderer?: string }): string {
  return data.renderer ?? COLLECTION_DEFAULTS[collection] ?? 'card';
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
  const [cards, posts, projects, puzzles, tags, stories, work] = await Promise.all([
    getCollection('cards'),
    getCollection('posts'),
    getCollection('projects'),
    getCollection('puzzles'),
    getCollection('tag'),
    getCollection('stories'),
    getCollection('work'),
  ]);

  const reader = makeFileReader();

  const [
    cardsMeta,
    postsMeta,
    projectsMeta,
    puzzlesMeta,
    storiesMeta,
    workMeta,
  ] = await Promise.all([
    Promise.all(cards.map(async c => ({
      uid: `cards/${c.id}`,
      collection: 'cards',
      id: c.id,
      title: c.data.title,
      description: c.data.description,
      tags: await effectiveTags('cards', c.id, c.data.tags, reader),
      renderer: resolveRenderer('cards', c.data),
      contentHash: computeContentHash(c.data.title, c.data.description, c.body),
    }))),
    Promise.all(posts.map(async p => ({
      uid: `posts/${p.id}`,
      collection: 'posts',
      id: p.id,
      title: p.data.title,
      description: p.data.description,
      date: p.data.date,
      tags: injectWhereTags(
        await effectiveTags('posts', p.id, p.data.tags, reader),
        p.data.date ? lookupLocationForDate(p.data.date, TRAVEL_LOG) : null,
      ),
      renderer: resolveRenderer('posts', p.data),
      contentHash: computeContentHash(p.data.title, p.data.description, p.body),
    }))),
    Promise.all(projects.map(async p => ({
      uid: `projects/${p.id}`,
      collection: 'projects',
      id: p.id,
      title: p.data.title,
      description: p.data.description,
      tags: await effectiveTags('projects', p.id, p.data.tags, reader),
      renderer: resolveRenderer('projects', p.data),
      contentHash: computeContentHash(p.data.title, p.data.description, p.body),
    }))),
    Promise.all(puzzles.map(async p => ({
      uid: `puzzles/${p.id}`,
      collection: 'puzzles',
      id: p.id,
      title: p.data.title,
      description: [p.data.puzzle_type, p.data.difficulty].filter(Boolean).join(' · '),
      date: p.data.date,
      tags: injectWhereTags(
        await effectiveTags('puzzles', p.id, p.data.tags, reader),
        p.data.date ? lookupLocationForDate(p.data.date, TRAVEL_LOG) : null,
      ),
      renderer: resolveRenderer('puzzles', p.data),
      contentHash: computeContentHash(p.data.title, p.data.description, p.body),
    }))),
    Promise.all(
      stories
        .filter(s => import.meta.env.DEV || s.data.published !== false)
        .map(async s => ({
          uid: `stories/${s.id}`,
          collection: 'stories',
          id: s.id,
          title: s.data.title ?? s.data.series,
          date: s.data.date,
          tags: injectWhereTags(
            await effectiveTags('stories', s.id, [], reader),
            s.data.date ? lookupLocationForDate(s.data.date, TRAVEL_LOG) : null,
          ),
          renderer: resolveRenderer('stories', s.data),
          contentHash: computeContentHash(s.data.title ?? s.data.series ?? '', undefined, s.body),
        }))
    ),
    Promise.all(work.map(async w => ({
      uid: `work/${w.id}`,
      collection: 'work',
      id: w.id,
      title: w.data.title,
      tags: await effectiveTags('work', w.id, [], reader),
      renderer: resolveRenderer('work', w.data),
      contentHash: computeContentHash(w.data.title, undefined, w.body),
    }))),
  ]);

  const tagsMeta = tags.map(t => ({
    uid: `tag/${t.id}`,
    collection: 'tag',
    id: t.id,
    title: t.data.name,
    description: t.data.description,
    tags: [] as string[],
    renderer: resolveRenderer('tag', t.data),
    contentHash: computeContentHash(t.data.name, t.data.description),
  }));

  return [...cardsMeta, ...postsMeta, ...projectsMeta, ...puzzlesMeta, ...tagsMeta, ...storiesMeta, ...workMeta];
}
