import { describe, it, expect } from 'vitest';
import { resolveLocation, resolveCardRenderer } from './location-resolver';
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

  it('resolves "<collection>/<id>" to kind: card, carrying the collection\'s nav renderer', () => {
    const result = resolveLocation('stories/arctic-01');
    expect(result).toEqual({
      kind: 'card',
      collection: 'stories',
      id: 'arctic-01',
      navComponent: NAV_RENDERERS.stories,
    });
  });

  it('a card location has a null navComponent when the collection has no nav renderer', () => {
    const result = resolveLocation('writing/why-portal');
    expect(result).toEqual({ kind: 'card', collection: 'writing', id: 'why-portal', navComponent: null });
  });

  it('resolves a registered lens name to kind: lens, with its definition and a callable loader', () => {
    const result = resolveLocation('lens/home');
    expect(result.kind).toBe('lens');
    if (result.kind === 'lens') {
      expect(result.name).toBe('home');
      expect(result.definition.id).toBe('home');
      expect(typeof result.loadComponent).toBe('function');
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
    expect(resolveCardRenderer('puzzle')).toBe(COLLECTION_RENDERERS.puzzle);
    expect(resolveCardRenderer('work')).toBe(COLLECTION_RENDERERS.work);
  });

  it('falls back to GenericRenderer for a renderer name with no dedicated component', () => {
    expect(resolveCardRenderer('post')).toBe(GenericRenderer);
    expect(resolveCardRenderer('story')).toBe(GenericRenderer);
    expect(resolveCardRenderer('card')).toBe(GenericRenderer);
  });
});
