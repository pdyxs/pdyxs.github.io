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
  return { id: id ?? 'what/projects/test', data: { description: undefined, ...data } };
}

export function fakeContent(): undefined {
  return undefined;
}

export function fakePuzzleEntry(overrides?: {
  id?: string;
  title?: string;
  difficulty?: string;
  date?: Date;
  url?: string;
  image?: string;
  puzzle_type?: string;
  sudokupad_url?: string;
}): { id: string; data: { title: string; difficulty: string; date: Date; url: string; image?: string; puzzle_type?: string; sudokupad_url?: string } } {
  const { id, ...data } = overrides ?? {};
  return {
    id: id ?? 'what/puzzles/test',
    data: {
      title: 'Test Puzzle',
      difficulty: 'Medium',
      date: new Date('2024-01-01'),
      url: 'https://example.com/puzzle',
      ...data,
    },
  };
}

export function fakeCardMeta(overrides?: Partial<CardMeta>): CardMeta {
  const base: CardMeta = {
    uid: 'what/cards/test',
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
