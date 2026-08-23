import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';
import { resolveCardTitle, resolveCardDescription, resolveCard, computeContentHash, inertDerivationControls } from './cards';
import type { CardEntry, ResolveContext } from './cards';
import type { FolderCascade } from './folder-config';
import { COLLECTION_RENDERERS } from './renderers';
import { resolveCardRenderer } from './location-resolver';
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

  it('every renderer name in use (post, story, card, puzzle, work) falls back to GenericRenderer', () => {
    for (const name of ['post', 'story', 'card', 'puzzle', 'work']) {
      expect(name in COLLECTION_RENDERERS).toBe(false);
      expect(resolveCardRenderer(name)).toBe(GenericRenderer);
    }
  });

  it('the retired tag and work renderer names are no longer registered', () => {
    expect('tag' in COLLECTION_RENDERERS).toBe(false);
    expect('work' in COLLECTION_RENDERERS).toBe(false);
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
  excludeTags: [],
  overrides: {},
  tagIdentity: {},
};

const CTX: ResolveContext = {
  frontmatterKeys: [],
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

    // ── derivation control, issue #116 ──────────────────────────────────────
    // The composition these two mechanisms have to get right is a folder-level
    // exclusion with a card-level escape from it, which is what the two story
    // folders now depend on.

    const DATED = { date: new Date('2017-09-15T00:00:00.000Z') }; // → Taghazout

    it('a folder-level exclusion suppresses the derivation for its cards', () => {
      const card = resolveFixture(
        // Canonical form: resolveCard is fed pre-transform data here, so the
        // fixture states what the zod `tags` transform would have produced.
        { id: 'what/posts/stories/x/01', data: { ...DATED, tags: ['where:europe/norway/svalbard'] } },
        { excludeTags: ['generated/location'] },
      );
      expect(card.tags).toContain('where:europe/norway/svalbard');
      expect(card.tags).not.toContain('where:africa/morocco/taghazout');
    });

    it('a card re-enables what its folder excluded', () => {
      const card = resolveFixture(
        { id: 'what/posts/stories/x/01', data: { ...DATED, tags: ['generated/location'] } },
        { excludeTags: ['generated/location'] },
      );
      expect(card.tags).toContain('where:africa/morocco/taghazout');
    });

    it('STRIPS the re-enable directive from the resolved tag list', () => {
      // It names no filter value; left in, it reaches the panel and the chips.
      const card = resolveFixture(
        { id: 'what/posts/x', data: { ...DATED, tags: ['generated/location'] } },
        { excludeTags: ['generated/location'] },
      );
      expect(card.tags.some(t => t.startsWith('generated'))).toBe(false);
    });

    it('a cascade-level re-enable works the same way', () => {
      const card = resolveFixture(
        { id: 'what/posts/x', data: DATED },
        { excludeTags: ['generated/location'], cascadeTags: ['generated/location'] },
      );
      expect(card.tags).toContain('where:africa/morocco/taghazout');
      expect(card.tags.some(t => t.startsWith('generated'))).toBe(false);
    });

    it('throws on a generated/* tag naming no derivation', () => {
      expect(() => resolveFixture({ id: 'what/posts/x', data: { tags: ['generated/nope'] } }))
        .toThrow(/names no generated derivation/);
    });

    it('throws on a generated/* excludeTags entry naming no derivation', () => {
      expect(() => resolveFixture({ id: 'what/posts/x', data: { excludeTags: ['generated/nope'] } }))
        .toThrow(/names no generated derivation/);
    });
  });

  describe('inertDerivationControls', () => {
    const DATED = { date: new Date('2017-09-15T00:00:00.000Z') };

    it('reports an exclusion that removed nothing', () => {
      expect(
        inertDerivationControls('what/posts/x', { excludeTags: ['where/europe'] }, EMPTY_CASCADE, []),
      ).toEqual(['where:europe']);
    });

    it('reports a re-enable with no exclusion to undo', () => {
      // My call (the coordinator left it open): a re-enable that re-enables
      // nothing is the same class of mistake as an exclusion that excludes
      // nothing — the author believes it is doing something.
      expect(
        inertDerivationControls('what/posts/x', { ...DATED, tags: ['generated/location'] }, EMPTY_CASCADE, []),
      ).toEqual(['generated/location']);
    });

    it('reports nothing when the re-enable actually undoes an exclusion', () => {
      expect(
        inertDerivationControls(
          'what/posts/x',
          { ...DATED, tags: ['generated/location'] },
          { ...EMPTY_CASCADE, excludeTags: ['generated/location'] },
          [],
        ),
      ).toEqual([]);
    });

    it('reports nothing for a card that controls nothing', () => {
      expect(inertDerivationControls('what/posts/x', DATED, EMPTY_CASCADE, [])).toEqual([]);
    });

    it('does NOT report an INHERITED entry that is inert for this card', () => {
      // The live case: `what/posts/stories/arctic` excludes generated/location
      // and pins Svalbard. For the 9 posts dated inside the Svalbard range the
      // derivation would have produced that same tag, so the exclusion removes
      // nothing *there* — while still being the only thing keeping the 13
      // posts written up in August out of Quito. Reported per-card that is 9
      // worklist entries with no available action.
      expect(
        inertDerivationControls(
          'what/posts/stories/arctic/05-reindeer',
          { date: new Date('2018-06-10T00:00:00.000Z') },
          {
            ...EMPTY_CASCADE,
            cascadeTags: ['where:europe/norway/svalbard'],
            excludeTags: ['generated/location'],
          },
          [],
        ),
      ).toEqual([]);
    });

    it('still reports the SAME entry when the card declares it itself', () => {
      // Provenance is the whole distinction — the author can act on their own
      // file.
      expect(
        inertDerivationControls(
          'what/posts/x',
          { date: new Date('2018-06-10T00:00:00.000Z'), excludeTags: ['where/antarctica'] },
          EMPTY_CASCADE,
          [],
        ),
      ).toEqual(['where:antarctica']);
    });

    it('does not report an inherited re-enable either', () => {
      expect(
        inertDerivationControls(
          'what/posts/x',
          DATED,
          { ...EMPTY_CASCADE, cascadeTags: ['generated/location'] },
          [],
        ),
      ).toEqual([]);
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

  describe('priority (issue #80)', () => {
    it('is zero for a card nothing declares anything about', () => {
      expect(resolveFixture({ id: 'what/posts/a' }).priority).toBe(0);
    });

    it('SUMS frontmatter, ancestor folders and tag declarations', () => {
      const card = resolveFixture(
        { id: 'what/puzzles/fog', data: { priority: 5, tags: ['who:me'] } },
        { priority: 100 },
        { tagPriorities: { 'who:me': 200 } },
      );
      expect(card.priority).toBe(305);
    });

    it('counts an ancestor folder once, not again as the card\'s path tag', () => {
      // derivePathTags gives this card `what:puzzles`, which the cascade has
      // already counted as an ancestor.
      const card = resolveFixture(
        { id: 'what/puzzles/fog' },
        { priority: 100 },
        { tagPriorities: { 'what:puzzles': 100 } },
      );
      expect(card.priority).toBe(100);
    });
  });

  describe('sort (issue #80)', () => {
    it('defaults to newest-first when no folder declares a sort', () => {
      const card = resolveFixture({ id: 'what/posts/a', data: { date: new Date('2024-01-02') } });
      expect(card.sort).toEqual({ key: 'date', direction: 'desc', value: new Date('2024-01-02').getTime() });
    });

    it('resolves the folder\'s declared key into this card\'s own value', () => {
      const card = resolveFixture(
        { id: 'what/puzzles/fog', data: { difficulty: 'Level 4 (Hard)' } },
        { sort: { key: 'difficulty', direction: 'asc' } },
      );
      expect(card.sort).toEqual({ key: 'difficulty', direction: 'asc', value: 4 });
    });

    it('leaves the value undefined when the card has nothing for that key, so it sorts last', () => {
      const card = resolveFixture(
        { id: 'what/puzzles/fog' },
        { sort: { key: 'difficulty', direction: 'asc' } },
      );
      expect(card.sort.value).toBeUndefined();
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
