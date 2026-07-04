import { describe, it, expect } from 'vitest';
import { resolveLocation, resolveCardRenderer } from './location-resolver';
import { COLLECTION_RENDERERS, COLLECTION_VIEW_RENDERERS, NAV_RENDERERS } from './renderers';
import GenericRenderer from '../components/card-renderers/GenericRenderer.astro';

describe('resolveLocation', () => {
  it('resolves a bare collection name with a registered view renderer to kind: collection-view', () => {
    const result = resolveLocation('posts');
    expect(result).toEqual({ kind: 'collection-view', collection: 'posts', component: COLLECTION_VIEW_RENDERERS.posts });
  });

  it('resolves a bare collection name with no view renderer to kind: unknown', () => {
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
  it('uses the per-entry renderer override when present', () => {
    expect(resolveCardRenderer('work', 'puzzles')).toBe(COLLECTION_RENDERERS.puzzles);
  });

  it('falls back to the collection default renderer', () => {
    expect(resolveCardRenderer('puzzles')).toBe(COLLECTION_RENDERERS.puzzles);
  });

  it('falls back to GenericRenderer when neither an override nor a collection default exists', () => {
    expect(resolveCardRenderer('writing')).toBe(GenericRenderer);
  });
});
