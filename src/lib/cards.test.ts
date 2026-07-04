import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';
import { getCardsForTag } from './cards';
import { COLLECTION_RENDERERS } from './renderers';
import { fakeCardMeta, fakeTagEntry } from '../test/fixtures';
import FilterRenderer from '../components/card-renderers/FilterRenderer.astro';
import PuzzleRenderer from '../components/card-renderers/PuzzleRenderer.astro';

const CONTENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../content');

/** Renderer per collection, sourced from each directory's _config.yaml (falls back to 'card'), plus the 'tag' collection's hardcoded renderer. */
function collectionDefaults(): Record<string, string> {
  const defaults: Record<string, string> = { tag: 'tag' };
  for (const dir of readdirSync(CONTENT_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory() || dir.name === 'tag') continue;
    let renderer = 'card';
    try {
      const text = readFileSync(resolve(CONTENT_DIR, dir.name, '_config.yaml'), 'utf-8');
      renderer = (parseYaml(text) as { renderer?: string } | null)?.renderer ?? 'card';
    } catch {
      // no _config.yaml — default renderer applies
    }
    defaults[dir.name] = renderer;
  }
  return defaults;
}

describe('renderer registry', () => {
  it('all non-generic collection default renderers are present in COLLECTION_RENDERERS', () => {
    const genericRenderers = new Set(['card', 'post', 'project', 'story', 'work']);
    const nonGenericKeys = Object.entries(collectionDefaults())
      .filter(([, renderer]) => !genericRenderers.has(renderer))
      .map(([key]) => key);

    for (const key of nonGenericKeys) {
      expect(COLLECTION_RENDERERS).toHaveProperty(key);
    }
  });

  it('explicit renderers resolve correctly and generic collections are absent', () => {
    expect(COLLECTION_RENDERERS['tag']).toBe(FilterRenderer);
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

  it('prefix-matches descendant tags for a dimension-prefixed tag id', () => {
    const tag = fakeTagEntry({ id: 'what/projects', name: 'Projects', aliases: [] });
    const exact = fakeCardMeta({ uid: 'cards/exact', tags: ['what:projects'] });
    const descendant = fakeCardMeta({ uid: 'cards/descendant', tags: ['what:projects/games'] });
    const unrelated = fakeCardMeta({ uid: 'cards/unrelated', tags: ['what:posts'] });
    const result = getCardsForTag(tag, [exact, descendant, unrelated]);
    expect(result).toEqual(expect.arrayContaining([exact, descendant]));
    expect(result).not.toContain(unrelated);
    expect(result).toHaveLength(2);
  });

  it('does not prefix-match flat tag ids with no dimension prefix', () => {
    const tag = fakeTagEntry({ id: 'puzzle', name: 'Puzzle', aliases: [] });
    const match = fakeCardMeta({ tags: ['puzzle'] });
    const noMatch = fakeCardMeta({ uid: 'cards/other', tags: ['puzzle/subtype'] });
    expect(getCardsForTag(tag, [match, noMatch])).toEqual([match]);
  });

  it('still applies alias matching alongside dimension prefix matching', () => {
    const tag = fakeTagEntry({ id: 'what/puzzles', name: 'Puzzles', aliases: ['brainteasers'] });
    const byPrefix = fakeCardMeta({ uid: 'cards/by-prefix', tags: ['what:puzzles/sudoku'] });
    const byAlias = fakeCardMeta({ uid: 'cards/by-alias', tags: ['brainteasers'] });
    const result = getCardsForTag(tag, [byPrefix, byAlias]);
    expect(result).toEqual(expect.arrayContaining([byPrefix, byAlias]));
    expect(result).toHaveLength(2);
  });
});
