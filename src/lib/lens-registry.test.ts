import { describe, it, expect } from 'vitest';
import { LENS_REGISTRY, lensUid, getLensDefinition, allLensUids, lensesForDimension, lensIdFromUid, activeLensIcon, DEFAULT_BROWSE_LENS_ID } from './lens-registry';

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

  it('width is a plain CSS-length string when a lens declares one', () => {
    const newest = getLensDefinition('newest');
    expect(typeof newest?.width).toBe('string');
    const home = getLensDefinition('home');
    expect(home?.width).toBeUndefined();
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

describe('lensesForDimension', () => {
  it('returns the lenses filed under a given dimension', () => {
    const when = lensesForDimension('when');
    expect(when.map(l => l.id)).toEqual(['newest']);
  });

  it('returns an empty array for a dimension with no filed lenses', () => {
    expect(lensesForDimension('who')).toEqual([]);
  });

  it('excludes the root-dimension home lens from every 5W dimension', () => {
    for (const dim of ['who', 'what', 'when', 'where', 'why'] as const) {
      expect(lensesForDimension(dim).map(l => l.id)).not.toContain('home');
    }
  });
});

describe('lensIdFromUid', () => {
  it('extracts the id from a lens uid', () => {
    expect(lensIdFromUid('lens/newest')).toBe('newest');
  });

  it('returns null for a card uid', () => {
    expect(lensIdFromUid('posts/some-post')).toBeNull();
  });

  it('returns null for null or undefined input', () => {
    expect(lensIdFromUid(null)).toBeNull();
    expect(lensIdFromUid(undefined)).toBeNull();
  });
});

describe('activeLensIcon', () => {
  it('returns the icon of the active lens when it is in the given list', () => {
    const when = lensesForDimension('when');
    expect(activeLensIcon(when, 'newest')).toBe('🕒');
  });

  it('returns undefined when the active lens id is not in the given list', () => {
    const who = lensesForDimension('who');
    expect(activeLensIcon(who, 'newest')).toBeUndefined();
  });

  it('returns undefined when there is no active lens', () => {
    const when = lensesForDimension('when');
    expect(activeLensIcon(when, null)).toBeUndefined();
  });

  it('falls back to a generic marker when the active lens declares no icon', () => {
    const iconless = [{ ...LENS_REGISTRY[0], icon: undefined, id: 'iconless' }];
    expect(activeLensIcon(iconless, 'iconless')).toBe('●');
  });
});

describe('DEFAULT_BROWSE_LENS_ID', () => {
  // The fallback target for filters added somewhere that can't accept them
  // (e.g. the home lens) — must resolve to a real, filter-accepting lens.
  it('resolves to a registered lens', () => {
    expect(getLensDefinition(DEFAULT_BROWSE_LENS_ID)).toBeDefined();
  });

  it('resolves to a lens that accepts filters', () => {
    expect(getLensDefinition(DEFAULT_BROWSE_LENS_ID)?.acceptsFilters).toBe(true);
  });

  it('is the newest lens', () => {
    expect(DEFAULT_BROWSE_LENS_ID).toBe('newest');
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
