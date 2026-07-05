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

  it('resolves a dimension-rooted card uid to kind: card, carrying its collection\'s nav renderer', () => {
    const result = resolveLocation('what/stories/arctic-01');
    expect(result).toEqual({
      kind: 'card',
      path: 'what/stories/arctic-01',
      navComponent: NAV_RENDERERS['what/stories'],
    });
  });

  it('a card location has a null navComponent when its collection has no nav renderer', () => {
    const result = resolveLocation('what/writing/why-portal');
    expect(result).toEqual({ kind: 'card', path: 'what/writing/why-portal', navComponent: null });
  });

  it('matches the nav renderer prefix exactly, not just any path sharing the prefix string', () => {
    // "what/storiesish" shares the "what/stories" string but isn't a descendant of it.
    const result = resolveLocation('what/storiesish/foo');
    expect(result).toEqual({ kind: 'card', path: 'what/storiesish/foo', navComponent: null });
  });

  it('resolves a tag location to kind: card with a null navComponent', () => {
    const result = resolveLocation('tag/who');
    expect(result).toEqual({ kind: 'card', path: 'tag/who', navComponent: null });
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
    expect(resolveCardRenderer('puzzle')).toBe(COLLECTION_RENDERERS.puzzle);
    expect(resolveCardRenderer('work')).toBe(COLLECTION_RENDERERS.work);
  });

  it('falls back to GenericRenderer for a renderer name with no dedicated component', () => {
    expect(resolveCardRenderer('post')).toBe(GenericRenderer);
    expect(resolveCardRenderer('story')).toBe(GenericRenderer);
    expect(resolveCardRenderer('card')).toBe(GenericRenderer);
  });
});
