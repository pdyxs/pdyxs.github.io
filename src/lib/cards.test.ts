import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';
import { getCardsForTag, resolveCardTitle, resolveCardDescription } from './cards';
import { COLLECTION_RENDERERS } from './renderers';
import { resolveCardRenderer } from './location-resolver';
import { fakeCardMeta, fakeTagEntry } from '../test/fixtures';
import FilterRenderer from '../components/card-renderers/FilterRenderer.astro';
import PuzzleRenderer from '../components/card-renderers/PuzzleRenderer.astro';
import WorkRenderer from '../components/card-renderers/WorkRenderer.astro';
import GenericRenderer from '../components/card-renderers/GenericRenderer.astro';

const CONTENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../content');

/** Every renderer name declared by a top-level directory's _config.yaml (the 'tag' collection's renderer is hardcoded in getAllCards, not config-driven, so it's excluded here). */
function rendererNamesInConfigs(): string[] {
  const names = new Set<string>();
  for (const dir of readdirSync(CONTENT_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory() || dir.name === 'tag') continue;
    try {
      const text = readFileSync(resolve(CONTENT_DIR, dir.name, '_config.yaml'), 'utf-8');
      const renderer = (parseYaml(text) as { renderer?: string } | null)?.renderer;
      if (renderer) names.add(renderer);
    } catch {
      // no _config.yaml at this level — no renderer declared
    }
  }
  return [...names];
}

describe('renderer registry', () => {
  it('every renderer name used in a _config.yaml resolves to a component, guarding against a silently-inert name', () => {
    for (const name of rendererNamesInConfigs()) {
      expect(resolveCardRenderer(name)).toBeTypeOf('function');
    }
  });

  it('renderer names with a dedicated component resolve to it', () => {
    expect(COLLECTION_RENDERERS['tag']).toBe(FilterRenderer);
    expect(COLLECTION_RENDERERS['puzzle']).toBe(PuzzleRenderer);
    expect(COLLECTION_RENDERERS['work']).toBe(WorkRenderer);
  });

  it('generic renderer names (post, story, card) are absent from the registry and fall back to GenericRenderer', () => {
    expect('post' in COLLECTION_RENDERERS).toBe(false);
    expect('story' in COLLECTION_RENDERERS).toBe(false);
    expect('card' in COLLECTION_RENDERERS).toBe(false);
    expect(resolveCardRenderer('post')).toBe(GenericRenderer);
    expect(resolveCardRenderer('story')).toBe(GenericRenderer);
    expect(resolveCardRenderer('card')).toBe(GenericRenderer);
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

describe('resolveCardTitle', () => {
  it('uses data.title when present', () => {
    expect(resolveCardTitle('what/posts/about-me', { title: 'Hello' })).toBe('Hello');
  });

  it('falls back to series for stories with no title', () => {
    expect(resolveCardTitle('what/stories/arctic/ch-01', { series: 'Arctic' })).toBe('Arctic');
  });

  it('falls back to empty string when nothing else applies', () => {
    expect(resolveCardTitle('what/posts/about-me', {})).toBe('');
  });

  it('does not apply the series fallback to a non-stories path even if a series field is present', () => {
    expect(resolveCardTitle('what/posts/about-me', { series: 'Arctic' })).toBe('');
  });
});

describe('resolveCardDescription', () => {
  it('uses data.description when present', () => {
    expect(resolveCardDescription('what/posts/about-me', { description: 'A post' })).toBe('A post');
  });

  it('builds a puzzle description from type and difficulty when description is absent', () => {
    expect(resolveCardDescription('what/puzzles/cartography', { puzzle_type: 'Logic', difficulty: 'Hard' })).toBe('Logic · Hard');
  });

  it('does not override an explicit puzzle description', () => {
    expect(resolveCardDescription('what/puzzles/cartography', { description: 'Custom', puzzle_type: 'Logic' })).toBe('Custom');
  });

  it('returns undefined for a non-puzzle entry with no description', () => {
    expect(resolveCardDescription('what/posts/about-me', {})).toBeUndefined();
  });

  it('does not apply the puzzle fallback to a non-puzzles path', () => {
    expect(resolveCardDescription('what/posts/about-me', { puzzle_type: 'Logic', difficulty: 'Hard' })).toBeUndefined();
  });
});
