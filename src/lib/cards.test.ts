import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';
import { resolveCardTitle, resolveCardDescription } from './cards';
import { COLLECTION_RENDERERS } from './renderers';
import { resolveCardRenderer } from './location-resolver';
import PuzzleRenderer from '../components/card-renderers/PuzzleRenderer.astro';
import WorkRenderer from '../components/card-renderers/WorkRenderer.astro';
import GenericRenderer from '../components/card-renderers/GenericRenderer.astro';

const CONTENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../content');

/** Every renderer name declared by a top-level directory's _config.yaml. */
function rendererNamesInConfigs(): string[] {
  const names = new Set<string>();
  for (const dir of readdirSync(CONTENT_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
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

  it('the retired tag renderer name is no longer registered', () => {
    expect('tag' in COLLECTION_RENDERERS).toBe(false);
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
