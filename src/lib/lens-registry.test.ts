import { describe, it, expect } from 'vitest';
import { dimensionById } from '../dimensions';
import { LENS_REGISTRY, lensUid, getLensDefinition, allLensUids, lensesForDimension, lensIdFromUid, activeLensIcon, DEFAULT_BROWSE_LENS_ID, isLensVisible } from './lens-registry';

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
    for (const lens of LENS_REGISTRY) {
      if (lens.width === undefined) continue;
      expect(lens.width, `lens "${lens.id}" declares a non-length width`).toMatch(/^\d+(\.\d+)?[a-z%]+$/);
    }
    // Home is the widest lens on the site (issue #132) — every browse-family
    // lens is 960px. It used to declare none at all, which is why this test
    // was written around it; `width` is still optional, home just isn't the
    // example of that any more.
    expect(getLensDefinition('home')?.width).toBe('1100px');
  });

  it('acceptsFilters defaults to true unless declared otherwise', () => {
    const newest = getLensDefinition('newest');
    expect(newest?.acceptsFilters).toBe(true);
  });

  it('home is the sole shipping acceptsFilters:false lens', () => {
    // audit (devOnly, issue #72) also opts out — it reports on the whole
    // content set, so a dimension filter would understate its counts.
    const noFilters = LENS_REGISTRY.filter(l => !l.acceptsFilters);
    expect(noFilters.map(l => l.id)).toEqual(['home', 'audit']);
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

  // Issue #79. A lens's `config` is free-form data that crosses into a body
  // component's typed prop unchecked (LensStackCard passes `lens.config`
  // straight to `<BodyComponent config=… />`), so an authoring slip in the
  // YAML — nesting the selections one level deeper under `selections:` —
  // type-checked clean and silently produced an *empty* FilterState: every
  // dimension saw "not narrowing", so all three home slots drew from the
  // whole pool. This guards the real generated registry rather than a
  // hand-built fixture, which is the gap that let the mismatch survive.
  it('every filter slot names only known dimensions in its filter', () => {
    for (const lens of LENS_REGISTRY) {
      const slots = (lens.config as { slots?: unknown[] } | undefined)?.slots ?? [];
      for (const slot of slots) {
        const s = slot as { type?: string; filter?: Record<string, unknown> };
        if (s.type !== 'filter') continue;
        expect(s.filter, `lens "${lens.id}" has a filter slot with no filter`).toBeDefined();
        for (const key of Object.keys(s.filter!)) {
          expect(
            dimensionById(key),
            `lens "${lens.id}" filter slot names unknown dimension "${key}"`,
          ).toBeDefined();
        }
      }
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
    // Ordered by each file's declared `order` — the two publication-time
    // timelines, then the two visitor-history lenses (issue #84).
    expect(when.map(l => l.id)).toEqual(['newest', 'oldest', 'seen', 'unseen']);
  });

  it('returns an empty array for a dimension with no filed lenses', () => {
    expect(lensesForDimension('who')).toEqual([]);
  });

  it('returns the home, interesting, editorial and audit lenses filed under what', () => {
    const what = lensesForDimension('what');
    // Most* Interesting is filed here rather than under `when` because it does
    // not sort on time (issue #68), and sits directly under home — the stack
    // root you are always already in — as the way out of it.
    expect(what.map(l => l.id)).toEqual(['home', 'interesting', 'editorial', 'audit']);
  });

  it('excludes home from every 5W dimension other than what', () => {
    for (const dim of ['who', 'when', 'where', 'why'] as const) {
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
    expect(activeLensIcon(when, 'newest')).toBe('timeline');
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
    expect(activeLensIcon(iconless, 'iconless')).toBe('dot');
  });
});

describe('isLensVisible', () => {
  it('a lens with no devOnly flag is visible whether or not isDev', () => {
    const lens = { ...LENS_REGISTRY[0], devOnly: undefined };
    expect(isLensVisible(lens, true)).toBe(true);
    expect(isLensVisible(lens, false)).toBe(true);
  });

  it('a devOnly lens is only visible when isDev is true', () => {
    const lens = { ...LENS_REGISTRY[0], devOnly: true };
    expect(isLensVisible(lens, true)).toBe(true);
    expect(isLensVisible(lens, false)).toBe(false);
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

  it('is Most* Interesting', () => {
    expect(DEFAULT_BROWSE_LENS_ID).toBe('interesting');
  });

  it('is UNCAPPED — a capped default is the bug this lens exists to close', () => {
    // ~279 of 285 cards were unreachable by browsing because the default lens
    // showed a slice. A `limit` reappearing here would restore that silently.
    expect(getLensDefinition(DEFAULT_BROWSE_LENS_ID)?.config?.limit).toBeUndefined();
  });

  it('ranks, and carries the footnote that admits the ranking is a judgement call', () => {
    const lens = getLensDefinition(DEFAULT_BROWSE_LENS_ID);
    expect(lens?.config?.sortKey).toBe('ranking');
    expect(lens?.note).toBe('*an attempt at that, anyway');
  });
});

describe('the capped timeline lenses', () => {
  // Newest and Oldest are strips, not grids (issue #82). The cap is what keeps
  // the strip's dot track legible, so a config that lost it would silently
  // degrade the track to a solid line rather than fail anything.
  for (const id of ['newest', 'oldest']) {
    it(`${id} is a strip capped at 30`, () => {
      const config = getLensDefinition(id)?.config;
      expect(config?.display).toBe('strip');
      expect(config?.limit).toBe(30);
    });
  }
});

describe('the history lenses', () => {
  // Seen and Unseen (issue #84) are one body told apart by `config.readState`
  // — a declaration that loses it silently becomes an ordinary browse lens
  // showing the whole pool, which is exactly what neither of them means.
  for (const [id, readState] of [['seen', 'seen'], ['unseen', 'unseen']] as const) {
    it(`${id} declares readState: ${readState} and rides the shared history body`, () => {
      const lens = getLensDefinition(id);
      expect(lens?.component).toBe('history');
      expect(lens?.config?.readState).toBe(readState);
      // Filed with the publication timelines: Seen sorts on time too, just the
      // visitor's; Unseen is filed for the complement.
      expect(lens?.dimension).toBe('when');
      // Uncapped — a history only shrinks (Unseen) or is exactly as long as
      // the visitor made it (Seen).
      expect(lens?.config?.limit).toBeUndefined();
    });
  }
});

describe('allLensUids', () => {
  it('enumerates every registry entry as a uid, resolvable without importing any component', () => {
    expect(allLensUids().sort()).toEqual([
      'lens/home',
      'lens/interesting',
      'lens/newest',
      'lens/oldest',
      'lens/seen',
      'lens/unseen',
    ]);
  });

  it('excludes a devOnly lens even though it is in LENS_REGISTRY (never gets a manifest code)', () => {
    const editorial = getLensDefinition('editorial');
    expect(editorial?.devOnly).toBe(true);
    expect(allLensUids()).not.toContain('lens/editorial');
  });

  it('excludes the devOnly audit lens the same way (issue #72)', () => {
    const audit = getLensDefinition('audit');
    expect(audit?.devOnly).toBe(true);
    // The DEV branch of the registration logic — the same predicate
    // src/pages/lens/[name].astro's getStaticPaths feeds import.meta.env.DEV.
    expect(isLensVisible(audit!, true)).toBe(true);
    expect(isLensVisible(audit!, false)).toBe(false);
    expect(allLensUids()).not.toContain('lens/audit');
  });

  it('every uid is resolvable back to a definition via getLensDefinition', () => {
    for (const uid of allLensUids()) {
      const id = uid.slice('lens/'.length);
      expect(getLensDefinition(id)).toBeDefined();
    }
  });
});
