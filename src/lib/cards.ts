import { getCollection } from 'astro:content';

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

  return [
    ...cards.map(c => ({
      uid: `cards/${c.id}`,
      collection: 'cards',
      id: c.id,
      title: c.data.title,
      description: c.data.description,
      tags: c.data.tags,
      renderer: resolveRenderer('cards', c.data),
    })),
    ...posts.map(p => ({
      uid: `posts/${p.id}`,
      collection: 'posts',
      id: p.id,
      title: p.data.title,
      description: p.data.description,
      date: p.data.date,
      tags: p.data.tags,
      renderer: resolveRenderer('posts', p.data),
    })),
    ...projects.map(p => ({
      uid: `projects/${p.id}`,
      collection: 'projects',
      id: p.id,
      title: p.data.title,
      description: p.data.description,
      tags: p.data.tags,
      renderer: resolveRenderer('projects', p.data),
    })),
    ...puzzles.map(p => ({
      uid: `puzzles/${p.id}`,
      collection: 'puzzles',
      id: p.id,
      title: p.data.title,
      description: [p.data.puzzle_type, p.data.difficulty].filter(Boolean).join(' · '),
      date: p.data.date,
      tags: p.data.tags,
      renderer: resolveRenderer('puzzles', p.data),
    })),
    ...tags.map(t => ({
      uid: `tag/${t.id}`,
      collection: 'tag',
      id: t.id,
      title: t.data.name,
      description: t.data.description,
      tags: [],
      renderer: resolveRenderer('tag', t.data),
    })),
    ...stories
      .filter(s => import.meta.env.DEV || s.data.published !== false)
      .map(s => ({
        uid: `stories/${s.id}`,
        collection: 'stories',
        id: s.id,
        title: s.data.title ?? s.data.series,
        date: s.data.date,
        tags: [],
        renderer: resolveRenderer('stories', s.data),
      })),
    ...work.map(w => ({
      uid: `work/${w.id}`,
      collection: 'work',
      id: w.id,
      title: w.data.title,
      tags: [],
      renderer: resolveRenderer('work', w.data),
    })),
  ];
}
