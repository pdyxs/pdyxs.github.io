import { describe, it, expect } from 'vitest';
import { COLLECTION_DEFAULTS } from './cards';
import { COLLECTION_RENDERERS } from './renderers';
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
