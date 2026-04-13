import type { CardMeta } from '../lib/cards';

export function fakeEntry(overrides?: { description?: string }): { data: { description?: string } } {
  return { data: { description: undefined, ...overrides } };
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
  return {
    uid: 'cards/test',
    collection: 'cards',
    id: 'test',
    title: 'Test Card',
    tags: [],
    renderer: 'card',
    ...overrides,
  };
}
