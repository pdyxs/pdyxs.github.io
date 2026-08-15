import { describe, it, expect } from 'vitest';
import { resolveLocation, resolveCardRenderer, resolveNavRenderer } from './location-resolver';
import { COLLECTION_RENDERERS, NAV_RENDERERS } from './renderers';
import GenericRenderer from '../components/card-renderers/GenericRenderer.astro';

describe('resolveLocation', () => {
  // Collection-view pages (posts/projects/puzzles) are retired (issue #26) —
  // COLLECTION_VIEW_RENDERERS is empty until a future collection view
  // registers here, so every bare collection name resolves to unknown now.
  it('resolves a bare collection name with no view renderer to kind: unknown', () => {
    expect(resolveLocation('posts')).toEqual({ kind: 'unknown' });
    expect(resolveLocation('nope')).toEqual({ kind: 'unknown' });
  });

  it('resolves a dimension-rooted card uid to kind: card (nav renderer is resolved separately from cascade)', () => {
    const result = resolveLocation('what/posts/stories/arctic/00-introduction');
    expect(result).toEqual({ kind: 'card', path: 'what/posts/stories/arctic/00-introduction' });
  });

  it('resolves a tag location to kind: card', () => {
    const result = resolveLocation('tag/who');
    expect(result).toEqual({ kind: 'card', path: 'tag/who' });
  });

  it('resolves a registered lens name to kind: lens, with its definition', () => {
    const result = resolveLocation('lens/home');
    expect(result.kind).toBe('lens');
    if (result.kind === 'lens') {
      expect(result.name).toBe('home');
      expect(result.definition.id).toBe('home');
    }
  });

  it('resolves an unregistered lens name to kind: unknown', () => {
    expect(resolveLocation('lens/does-not-exist')).toEqual({ kind: 'unknown' });
  });

  it('resolves a bare "lens/" (no name) to kind: unknown', () => {
    expect(resolveLocation('lens/')).toEqual({ kind: 'unknown' });
  });

  it('resolves an empty path to kind: unknown', () => {
    expect(resolveLocation('')).toEqual({ kind: 'unknown' });
  });
});

describe('resolveCardRenderer', () => {
  it('maps a registered renderer name to its component', () => {
    // COLLECTION_RENDERERS is empty (issue #89) — the lookup itself is what is
    // under test, so it is exercised against a stand-in entry rather than a
    // real one, which would otherwise make this test unwritable.
    COLLECTION_RENDERERS.stub = GenericRenderer;
    try {
      expect(resolveCardRenderer('stub')).toBe(COLLECTION_RENDERERS.stub);
    } finally {
      delete COLLECTION_RENDERERS.stub;
    }
  });

  it('falls back to GenericRenderer for a renderer name with no dedicated component', () => {
    expect(resolveCardRenderer('post')).toBe(GenericRenderer);
    expect(resolveCardRenderer('story')).toBe(GenericRenderer);
    expect(resolveCardRenderer('card')).toBe(GenericRenderer);
    expect(resolveCardRenderer('work')).toBe(GenericRenderer);
  });
});

describe('resolveNavRenderer', () => {
  it('maps a registered nav-renderer name to its component', () => {
    expect(resolveNavRenderer('series')).toBe(NAV_RENDERERS.series);
  });

  it('returns null for an undeclared (undefined) nav renderer', () => {
    expect(resolveNavRenderer(undefined)).toBeNull();
  });

  it('returns null for a nav-renderer name with no registered component', () => {
    expect(resolveNavRenderer('nope')).toBeNull();
  });
});
