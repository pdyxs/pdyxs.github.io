import { describe, it, expect } from 'vitest';
import { COLLECTION_DEFAULTS, getCardsForTag } from './cards';
import { COLLECTION_RENDERERS } from './renderers';
import { fakeCardMeta, fakeTagEntry } from '../test/fixtures';
import TagRenderer from '../components/card-renderers/TagRenderer.astro';
import PuzzleRenderer from '../components/card-renderers/PuzzleRenderer.astro';

describe('renderer registry', () => {
  it('all non-generic COLLECTION_DEFAULTS keys are present in COLLECTION_RENDERERS', () => {
    const genericRenderers = new Set(['card', 'post', 'project', 'story', 'work']);
    const nonGenericKeys = Object.entries(COLLECTION_DEFAULTS)
      .filter(([, renderer]) => !genericRenderers.has(renderer))
      .map(([key]) => key);

    for (const key of nonGenericKeys) {
      expect(COLLECTION_RENDERERS).toHaveProperty(key);
    }
  });

  it('explicit renderers resolve correctly and generic collections are absent', () => {
    expect(COLLECTION_RENDERERS['tag']).toBe(TagRenderer);
    expect(COLLECTION_RENDERERS['puzzles']).toBe(PuzzleRenderer);
    expect('posts' in COLLECTION_RENDERERS).toBe(false);
  });
});

describe('getCardsForTag', () => {
  it('filters cards matching tag id', () => {
    const tag = fakeTagEntry({ id: 'puzzle', name: 'Puzzle', aliases: [] });
    const match = fakeCardMeta({ tags: ['puzzle'] });
    const noMatch = fakeCardMeta({ uid: 'cards/other', tags: ['sudoku'] });
    expect(getCardsForTag(tag, [match, noMatch])).toEqual([match]);
  });

  it('filters by name (case-insensitive)', () => {
    const tag = fakeTagEntry({ id: 'logic', name: 'Logic', aliases: [] });
    const match = fakeCardMeta({ tags: ['LOGIC'] });
    const noMatch = fakeCardMeta({ uid: 'cards/other', tags: ['math'] });
    expect(getCardsForTag(tag, [match, noMatch])).toEqual([match]);
  });

  it('filters by alias', () => {
    const tag = fakeTagEntry({ id: 'sudoku', name: 'Sudoku', aliases: ['number-place'] });
    const match = fakeCardMeta({ tags: ['Number-Place'] });
    const noMatch = fakeCardMeta({ uid: 'cards/other', tags: ['crossword'] });
    expect(getCardsForTag(tag, [match, noMatch])).toEqual([match]);
  });

  it('excludes non-matching cards', () => {
    const tag = fakeTagEntry({ id: 'x', name: 'X', aliases: [] });
    const noMatch = fakeCardMeta({ tags: ['y', 'z'] });
    expect(getCardsForTag(tag, [noMatch])).toEqual([]);
  });

  it('sorts dated cards before undated', () => {
    const tag = fakeTagEntry({ id: 't', name: 't', aliases: [] });
    const undated = fakeCardMeta({ uid: 'cards/undated', tags: ['t'] });
    const dated = fakeCardMeta({ uid: 'cards/dated', tags: ['t'], date: new Date('2024-01-01') });
    const result = getCardsForTag(tag, [undated, dated]);
    expect(result[0]).toBe(dated);
    expect(result[1]).toBe(undated);
  });

  it('sorts dated cards newest-first', () => {
    const tag = fakeTagEntry({ id: 't', name: 't', aliases: [] });
    const older = fakeCardMeta({ uid: 'cards/older', tags: ['t'], date: new Date('2023-01-01') });
    const newer = fakeCardMeta({ uid: 'cards/newer', tags: ['t'], date: new Date('2024-01-01') });
    const result = getCardsForTag(tag, [older, newer]);
    expect(result[0]).toBe(newer);
    expect(result[1]).toBe(older);
  });

  it('returns empty array when no matches', () => {
    const tag = fakeTagEntry({ id: 't', name: 't', aliases: [] });
    expect(getCardsForTag(tag, [])).toEqual([]);
  });
});
