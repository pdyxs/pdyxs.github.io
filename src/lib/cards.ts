import { getCollection } from 'astro:content';

// Default renderer per collection — override per-card with `renderer` in frontmatter
const COLLECTION_DEFAULTS: Record<string, string> = {
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

function resolveRenderer(collection: string, data: { renderer?: string }): string {
  return data.renderer ?? COLLECTION_DEFAULTS[collection] ?? 'card';
}

export async function getAllCards(): Promise<CardMeta[]> {
  const [cards, posts, projects, puzzles, tags] = await Promise.all([
    getCollection('cards'),
    getCollection('posts'),
    getCollection('projects'),
    getCollection('puzzles'),
    getCollection('tag'),
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
  ];
}
