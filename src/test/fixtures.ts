import type { CardMeta } from '../lib/cards';

interface Action {
  text: string;
  url: string;
}

interface Quote {
  quote: string;
  by?: string;
  in?: { text: string; url: string };
}

export function fakeEntry(overrides?: {
  id?: string;
  description?: string;
  image?: string;
  status?: string;
  medium?: string;
  canonical_url?: string;
  source?: string;
  actions?: Action[];
  quotes?: Quote[];
  images?: string[];
  tags?: string[];
}): {
  id: string;
  data: {
    description?: string;
    image?: string;
    status?: string;
    medium?: string;
    canonical_url?: string;
    source?: string;
    actions?: Action[];
    quotes?: Quote[];
    images?: string[];
    tags?: string[];
  };
} {
  const { id, ...data } = overrides ?? {};
  return { id: id ?? 'projects/test', data: { description: undefined, ...data } };
}

export function fakeContent(): undefined {
  return undefined;
}

export function fakePuzzleEntry(overrides?: {
  title?: string;
  difficulty?: string;
  date?: Date;
  url?: string;
  image?: string;
  puzzle_type?: string;
  sudokupad_url?: string;
}): { data: { title: string; difficulty: string; date: Date; url: string; image?: string; puzzle_type?: string; sudokupad_url?: string } } {
  return {
    data: {
      title: 'Test Puzzle',
      difficulty: 'Medium',
      date: new Date('2024-01-01'),
      url: 'https://example.com/puzzle',
      ...overrides,
    },
  };
}

export function fakeTagEntry(overrides?: {
  id?: string;
  name?: string;
  aliases?: string[];
  description?: string;
}): { id: string; data: { name: string; aliases: string[]; description?: string } } {
  const { id, name, aliases, description } = overrides ?? {};
  return {
    id: id ?? 'test-tag',
    data: {
      name: name ?? 'Test Tag',
      aliases: aliases ?? [],
      description,
    },
  };
}

export function fakeCardMeta(overrides?: Partial<CardMeta>): CardMeta {
  const base: CardMeta = {
    uid: 'cards/test',
    collection: 'cards',
    id: 'test',
    title: 'Test Card',
    tags: [],
    renderer: 'card',
    contentHash: 'default-hash',
    ...overrides,
  };
  // Re-derive contentHash from title if not explicitly overridden, so distinct
  // fakeCardMeta({ title: 'X' }) calls produce distinct hashes automatically.
  if (!overrides?.contentHash) {
    base.contentHash = `hash:${base.title}:${base.uid}`;
  }
  return base;
}
