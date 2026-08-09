import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';
import { resolveCardTitle, resolveCardDescription, resolveCard, computeContentHash } from './cards';
import type { CardEntry, ResolveContext } from './cards';
import type { FolderCascade } from './folder-config';
import { COLLECTION_RENDERERS } from './renderers';
import { resolveCardRenderer } from './location-resolver';
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
    expect(COLLECTION_RENDERERS['work']).toBe(WorkRenderer);
  });

  it('generic renderer names (post, story, card, puzzle) are absent from the registry and fall back to GenericRenderer', () => {
    expect('post' in COLLECTION_RENDERERS).toBe(false);
    expect('story' in COLLECTION_RENDERERS).toBe(false);
    expect('card' in COLLECTION_RENDERERS).toBe(false);
    expect('puzzle' in COLLECTION_RENDERERS).toBe(false);
    expect(resolveCardRenderer('post')).toBe(GenericRenderer);
    expect(resolveCardRenderer('story')).toBe(GenericRenderer);
    expect(resolveCardRenderer('card')).toBe(GenericRenderer);
    expect(resolveCardRenderer('puzzle')).toBe(GenericRenderer);
  });

  it('the retired tag renderer name is no longer registered', () => {
    expect('tag' in COLLECTION_RENDERERS).toBe(false);
  });
});

describe('resolveCardTitle', () => {
  it('uses data.title when present', () => {
    expect(resolveCardTitle({ title: 'Hello' })).toBe('Hello');
  });

  it('falls back to empty string when no title is declared', () => {
    expect(resolveCardTitle({})).toBe('');
  });

  // The stories-fallback-to-series rule was deleted in #77. It had been dead
  // since stories moved to `what/posts/stories/` (its prefix check still said
  // `what/stories/`), and its own test passed only because it used a synthetic
  // uid matching the stale prefix. Reviving it would have titled chapters with
  // the lowercase slug, "arctic".
  it('does not fall back to series, for stories or anything else', () => {
    expect(resolveCardTitle({ series: 'arctic' } as { title?: string })).toBe('');
  });
});

describe('resolveCardDescription', () => {
  const puzzleParts = ['{{puzzle_type}}', '{{difficulty}}'];

  it('uses data.description when present', () => {
    expect(resolveCardDescription({ description: 'A post' })).toBe('A post');
  });

  it('synthesises a description from cardDescriptionParts when absent', () => {
    expect(resolveCardDescription({ puzzle_type: 'Logic', difficulty: 'Hard' }, puzzleParts)).toBe('Logic · Hard');
  });

  it('drops parts whose field is missing (puzzle_type absent)', () => {
    expect(resolveCardDescription({ difficulty: 'Level 2 (Easy)' }, puzzleParts)).toBe('Level 2 (Easy)');
  });

  it('does not override an explicit description with parts', () => {
    expect(resolveCardDescription({ description: 'Custom', difficulty: 'Hard' }, puzzleParts)).toBe('Custom');
  });

  it('returns undefined with no description and no parts', () => {
    expect(resolveCardDescription({})).toBeUndefined();
  });

  it('returns undefined when every part drops', () => {
    expect(resolveCardDescription({}, puzzleParts)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolveCard — the whole resolution sequence in one place (issue #77).
//
// This is the coverage the sequence never had. Its individual helpers
// (resolveCardTitle, resolveCardDescription, computeContentHash, resolveStatus)
// were all well tested, but *how they were called* was not reachable from a
// test at all: getAllCards() goes through getCollection() and import.meta.env,
// so the call order lived only inside an Astro build. That's why a second
// implementation could drift in CardStackCard.astro guarded by nothing but
// comments.
// ---------------------------------------------------------------------------

const EMPTY_CASCADE: FolderCascade = {
  cascadeTags: [],
  overrides: {},
  tagIdentity: {},
};

const CTX: ResolveContext = {
  overrideKeys: [],
  isDev: false,
  now: new Date('2026-01-01T00:00:00Z'),
};

function resolveFixture(
  entry: Partial<CardEntry> & { id: string },
  cascade: Partial<FolderCascade> = {},
  ctx: Partial<ResolveContext> = {},
) {
  return resolveCard(
    { data: {}, ...entry },
    { ...EMPTY_CASCADE, ...cascade },
    { ...CTX, ...ctx },
  );
}

describe('resolveCard', () => {
  it('carries the entry id through as the uid', () => {
    expect(resolveFixture({ id: 'what/posts/hello' }).uid).toBe('what/posts/hello');
  });

  describe('renderer', () => {
    it('prefers a frontmatter renderer over the cascade', () => {
      const card = resolveFixture({ id: 'what/puzzles/x', data: { renderer: 'work' } }, { renderer: 'puzzle' });
      expect(card.renderer).toBe('work');
    });

    it('falls back to the cascaded renderer', () => {
      expect(resolveFixture({ id: 'what/puzzles/x' }, { renderer: 'puzzle' }).renderer).toBe('puzzle');
    });

    it("defaults to 'card' when neither declares one", () => {
      expect(resolveFixture({ id: 'what/posts/x' }).renderer).toBe('card');
    });
  });

  describe('navRenderer', () => {
    it('prefers a frontmatter navRenderer over the cascade', () => {
      const card = resolveFixture({ id: 'a/b', data: { navRenderer: 'series' } }, { navRenderer: 'other' });
      expect(card.navRenderer).toBe('series');
    });

    it('falls back to the cascaded navRenderer', () => {
      expect(resolveFixture({ id: 'a/b' }, { navRenderer: 'series' }).navRenderer).toBe('series');
    });

    it('is undefined when neither declares one (plain card shell)', () => {
      expect(resolveFixture({ id: 'a/b' }).navRenderer).toBeUndefined();
    });
  });

  describe('status and visibility', () => {
    it('prefers a frontmatter status over the cascade', () => {
      expect(resolveFixture({ id: 'a/b', data: { status: 'draft' } }, { status: 'published' }).status).toBe('draft');
    });

    it('falls back to the cascaded status', () => {
      expect(resolveFixture({ id: 'a/b' }, { status: 'draft' }).status).toBe('draft');
    });

    it("defaults to 'published' when neither declares one", () => {
      expect(resolveFixture({ id: 'a/b' }).status).toBe('published');
    });

    it('hides a draft outside dev', () => {
      const card = resolveFixture({ id: 'a/b', data: { status: 'draft' } }, {}, { isDev: false });
      expect(card.visibility.listed).toBe(false);
      expect(card.visibility.reachable).toBe(false);
    });

    it('surfaces a draft in dev', () => {
      const card = resolveFixture({ id: 'a/b', data: { status: 'draft' } }, {}, { isDev: true });
      expect(card.visibility.listed).toBe(true);
    });

    // The clock is injected rather than read from the ambient environment, so a
    // date-sensitive status can be tested at a fixed instant.
    it('evaluates visibility against the injected clock, not the wall clock', () => {
      const card = resolveFixture(
        { id: 'a/b', data: { status: 'scheduled', date: new Date('2026-06-01T00:00:00Z') } },
        {},
        { now: new Date('2026-01-01T00:00:00Z') },
      );
      expect(card.visibility.listed).toBe(false);
    });
  });

  describe('description', () => {
    it('prefers frontmatter description over a cascade template', () => {
      const card = resolveFixture(
        { id: 'a/b', data: { description: 'Mine', difficulty: 'Hard' } },
        { cardDescriptionParts: ['{{difficulty}}'] },
      );
      expect(card.description).toBe('Mine');
    });

    it('synthesises from cascade templates when frontmatter declares none', () => {
      const card = resolveFixture(
        { id: 'a/b', data: { puzzle_type: 'Logic', difficulty: 'Hard' } },
        { cardDescriptionParts: ['{{puzzle_type}}', '{{difficulty}}'] },
      );
      expect(card.description).toBe('Logic · Hard');
    });

    it('falls back to a body excerpt when neither frontmatter nor templates produce one', () => {
      const card = resolveFixture({ id: 'a/b', body: 'The body text of the card.' });
      expect(card.description).toContain('The body text');
    });
  });

  describe('tags', () => {
    it('derives the path tag from the uid', () => {
      expect(resolveFixture({ id: 'what/posts/hello' }).tags).toContain('what:posts');
    });

    it('merges cascade tags and frontmatter tags with the path tag', () => {
      const card = resolveFixture(
        { id: 'what/posts/hello', data: { tags: ['science'] } },
        { cascadeTags: ['who:paul'] },
      );
      expect(card.tags).toEqual(expect.arrayContaining(['what:posts', 'who:paul', 'science']));
    });

    it('treats absent frontmatter tags as none (unvalidated entries have no zod default)', () => {
      expect(() => resolveFixture({ id: 'what/posts/hello', data: {} })).not.toThrow();
    });
  });

  describe('contentHash', () => {
    it('matches computeContentHash over the resolved title/description/body', () => {
      const entry = { id: 'a/b', data: { title: 'T', description: 'D' }, body: 'B' };
      expect(resolveFixture(entry).contentHash).toBe(computeContentHash('T', 'D', 'B'));
    });

    it('changes when the body changes', () => {
      const a = resolveFixture({ id: 'a/b', data: { title: 'T' }, body: 'one' });
      const b = resolveFixture({ id: 'a/b', data: { title: 'T' }, body: 'two' });
      expect(a.contentHash).not.toBe(b.contentHash);
    });

    // The hash keys client-side read tracking (getViewState), so it must depend
    // only on content — not on which build or which route resolved the card.
    it('is stable across repeated resolution of the same entry', () => {
      const entry = { id: 'a/b', data: { title: 'T' }, body: 'B' };
      expect(resolveFixture(entry).contentHash).toBe(resolveFixture(entry).contentHash);
    });
  });

  describe('render-only fields', () => {
    it('carries titleSuffix and width through from frontmatter', () => {
      const card = resolveFixture({ id: 'a/b', data: { titleSuffix: '(draft)', width: '900px' } });
      expect(card.titleSuffix).toBe('(draft)');
      expect(card.width).toBe('900px');
    });

    it('leaves width undefined when unset, so the global default applies', () => {
      expect(resolveFixture({ id: 'a/b' }).width).toBeUndefined();
    });

    it('prefers a frontmatter dateLabel over the folder cascade', () => {
      const card = resolveFixture(
        { id: 'a/b', data: { dateLabel: 'Released' } },
        { dateLabel: 'Published' },
      );
      expect(card.dateLabel).toBe('Released');
    });

    it('falls back to the cascaded dateLabel, and to undefined when neither declares one', () => {
      expect(resolveFixture({ id: 'a/b' }, { dateLabel: 'Published' }).dateLabel).toBe('Published');
      expect(resolveFixture({ id: 'a/b' }).dateLabel).toBeUndefined();
    });
  });
});
