import { describe, it, expect } from 'vitest';
import { LENS_REGISTRY, lensUid, getLensDefinition, allLensUids } from './lens-registry';

describe('LENS_REGISTRY', () => {
  it('declares home and newest as live lenses', () => {
    const ids = LENS_REGISTRY.map(l => l.id);
    expect(ids).toContain('home');
    expect(ids).toContain('newest');
  });

  it('every entry declares required fields', () => {
    for (const lens of LENS_REGISTRY) {
      expect(typeof lens.id).toBe('string');
      expect(lens.id.length).toBeGreaterThan(0);
      expect(typeof lens.dimension).toBe('string');
      expect(typeof lens.label).toBe('string');
      expect(typeof lens.component).toBe('string');
      expect(typeof lens.acceptsFilters).toBe('boolean');
      expect(['card', 'fullbleed']).toContain(lens.presentation);
    }
  });

  it('acceptsFilters defaults to true unless declared otherwise', () => {
    const newest = getLensDefinition('newest');
    expect(newest?.acceptsFilters).toBe(true);
  });

  it('home is the sole acceptsFilters:false lens', () => {
    const noFilters = LENS_REGISTRY.filter(l => !l.acceptsFilters);
    expect(noFilters.map(l => l.id)).toEqual(['home']);
  });

  it('component field is a plain string key, never a function — guards the lazy-load boundary', () => {
    // If a lens ever held a live component reference here, importing this
    // module (e.g. from the manifest-generation script) would eagerly load
    // every lens's rendering code. Asserting the field is a string proves
    // that can't happen: resolving a component always requires a second,
    // separate lookup (lens-components.ts) that this module never imports.
    for (const lens of LENS_REGISTRY) {
      expect(typeof lens.component).toBe('string');
    }
  });
});

describe('lensUid', () => {
  it('builds the collection/id-shaped uid for a lens', () => {
    expect(lensUid('home')).toBe('lens/home');
  });
});

describe('getLensDefinition', () => {
  it('resolves a known lens id', () => {
    expect(getLensDefinition('home')?.id).toBe('home');
  });

  it('returns undefined for an unknown lens id', () => {
    expect(getLensDefinition('does-not-exist')).toBeUndefined();
  });
});

describe('allLensUids', () => {
  it('enumerates every registry entry as a uid, resolvable without importing any component', () => {
    expect(allLensUids().sort()).toEqual(['lens/home', 'lens/newest']);
  });

  it('every uid is resolvable back to a definition via getLensDefinition', () => {
    for (const uid of allLensUids()) {
      const id = uid.slice('lens/'.length);
      expect(getLensDefinition(id)).toBeDefined();
    }
  });
});
