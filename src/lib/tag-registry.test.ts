import { describe, it, expect } from 'vitest';
import { computeTagRegistry, discoverTagSources, getTagRegistry, getDimensionGroupOrder, flattenTagDisplay } from './tag-registry';
import type { TreeReader } from './tag-registry';
import { extractDimensionTags } from './browse-helpers';
import { fakeCardMeta } from '../test/fixtures';

/** Builds a fixture TreeReader from a flat map of file path -> content, deriving directory listings from the paths present (mirrors folder-config.test.ts's flat-file-map style, extended with directory enumeration). */
function makeTreeReaderFromFiles(files: Record<string, string>): TreeReader {
  const paths = Object.keys(files);
  return {
    async readFile(path) {
      return files[path] ?? null;
    },
    async listDir(dir) {
      const prefix = dir ? `${dir}/` : '';
      const seen = new Map<string, boolean>();
      for (const p of paths) {
        if (!p.startsWith(prefix)) continue;
        const rest = p.slice(prefix.length);
        const slashIdx = rest.indexOf('/');
        if (slashIdx === -1) {
          seen.set(rest, false);
        } else {
          seen.set(rest.slice(0, slashIdx), true);
        }
      }
      return [...seen.entries()].map(([name, isDirectory]) => ({ name, isDirectory }));
    },
  };
}

describe('computeTagRegistry — value list', () => {
  it('includes a tag actually used on content, with no declarations at all', () => {
    const cards = [fakeCardMeta({ uid: 'what/posts/a', tags: ['what:projects'] })];
    const registry = computeTagRegistry(cards);
    expect(registry.what.values).toContain('what:projects');
  });

  it('includes a container-declared value even when no card uses it yet', () => {
    const cards = [fakeCardMeta({ uid: 'what/posts/a', tags: ['what:posts'] })];
    const registry = computeTagRegistry(cards, [{ value: 'what:puzzles', name: 'Puzzles' }]);
    expect(registry.what.values).toContain('what:puzzles');
  });

  it('includes a .tag.yaml-declared value even when no card uses it yet', () => {
    const cards = [fakeCardMeta({ uid: 'what/posts/a', tags: ['what:posts'] })];
    const registry = computeTagRegistry(cards, [], [{ value: 'what:topics/design', name: 'Design' }]);
    expect(registry.what.values).toContain('what:topics/design');
  });

  it('deduplicates a value that is both declared and used', () => {
    const cards = [fakeCardMeta({ uid: 'what/posts/a', tags: ['what:puzzles'] })];
    const registry = computeTagRegistry(cards, [{ value: 'what:puzzles', name: 'Puzzles' }]);
    expect(registry.what.values.filter(v => v === 'what:puzzles')).toHaveLength(1);
  });

  it('excludes values from other dimensions', () => {
    const cards = [fakeCardMeta({ uid: 'what/posts/a', tags: ['who:paul'] })];
    const registry = computeTagRegistry(cards, [{ value: 'why:creative', name: 'Creative' }]);
    expect(registry.what.values).toEqual([]);
  });
});

describe('computeTagRegistry — name-source precedence', () => {
  it('falls back to a humanised last path segment when nothing is declared', () => {
    const cards = [fakeCardMeta({ uid: 'what/posts/a', tags: ['what:projects/data-art'] })];
    const registry = computeTagRegistry(cards);
    expect(registry.what.display.get('what:projects/data-art')).toEqual({ name: 'Data Art', declared: false });
  });

  it('prefers a card-folder title over the humanised fallback', () => {
    const referencing = fakeCardMeta({ uid: 'what/writing/a-post', tags: ['what:projects/particulars'] });
    const project = fakeCardMeta({ uid: 'what/projects/particulars', title: 'Particulars', tags: ['what:projects'] });
    const registry = computeTagRegistry([referencing, project]);
    expect(registry.what.display.get('what:projects/particulars')).toEqual({
      name: 'Particulars',
      declared: false,
      cardUid: 'what/projects/particulars',
    });
  });

  it('prefers a container _config.yaml identity over a card-folder title', () => {
    const cards = [
      fakeCardMeta({ uid: 'what/puzzles/sudoku', title: 'Sudoku', tags: ['what:puzzles'] }),
    ];
    const registry = computeTagRegistry(cards, [{ value: 'what:puzzles', name: 'Puzzles', description: 'Logic puzzles' }]);
    expect(registry.what.display.get('what:puzzles')).toEqual({ name: 'Puzzles', description: 'Logic puzzles', declared: true });
  });

  it('prefers a .tag.yaml declaration over a container _config.yaml identity for the same value', () => {
    const cards = [fakeCardMeta({ uid: 'what/posts/a', tags: ['what:puzzles'] })];
    const registry = computeTagRegistry(
      cards,
      [{ value: 'what:puzzles', name: 'From Container' }],
      [{ value: 'what:puzzles', name: 'From Tag Yaml' }],
    );
    expect(registry.what.display.get('what:puzzles')?.name).toBe('From Tag Yaml');
  });

  it('description is optional and absent when no source declares one', () => {
    const cards = [fakeCardMeta({ uid: 'what/posts/a', tags: ['what:puzzles'] })];
    const registry = computeTagRegistry(cards, [{ value: 'what:puzzles', name: 'Puzzles' }]);
    expect(registry.what.display.get('what:puzzles')).toEqual({ name: 'Puzzles', declared: true });
  });

  it('takes a description from a lower-precedence source when a higher one supplies only a name', () => {
    const cards = [fakeCardMeta({ uid: 'what/posts/a', tags: ['what:puzzles'] })];
    const registry = computeTagRegistry(
      cards,
      [{ value: 'what:puzzles', description: 'From Container' }],
      [{ value: 'what:puzzles', name: 'From Tag Yaml' }],
    );
    expect(registry.what.display.get('what:puzzles')).toEqual({ name: 'From Tag Yaml', description: 'From Container', declared: true });
  });
});

describe('flattenTagDisplay', () => {
  it('flattens every dimension\'s display map into one plain object keyed by value', () => {
    const cards = [
      fakeCardMeta({ uid: 'what/posts/a', tags: ['what:puzzles', 'who:paul'] }),
    ];
    const registry = computeTagRegistry(cards, [
      { value: 'what:puzzles', name: 'Puzzles', description: 'Logic puzzles' },
      { value: 'who:paul', name: 'Paul' },
    ]);
    const flat = flattenTagDisplay(registry);
    expect(flat).toEqual({
      'what:puzzles': { name: 'Puzzles', description: 'Logic puzzles', declared: true },
      'who:paul': { name: 'Paul', declared: true },
    });
  });

  it('returns an empty object for an empty registry', () => {
    const registry = computeTagRegistry([]);
    expect(flattenTagDisplay(registry)).toEqual({});
  });
});

describe('discoverTagSources', () => {
  it('finds a container _config.yaml identity at a nested directory', async () => {
    const reader = makeTreeReaderFromFiles({
      'what/puzzles/_config.yaml': 'renderer: puzzle\nname: Puzzles\ndescription: Logic puzzles\n',
    });
    const { containerIdentities } = await discoverTagSources(reader);
    expect(containerIdentities).toEqual([
      { value: 'what:puzzles', name: 'Puzzles', description: 'Logic puzzles' },
    ]);
  });

  it('ignores a _config.yaml with only a renderer (no name/description)', async () => {
    const reader = makeTreeReaderFromFiles({
      'what/projects/_config.yaml': 'renderer: card\n',
    });
    const { containerIdentities } = await discoverTagSources(reader);
    expect(containerIdentities).toEqual([]);
  });

  it('finds a .tag.yaml declaration at the dimension root', async () => {
    const reader = makeTreeReaderFromFiles({
      'who/nocv.tag.yaml': 'name: No CV\n',
    });
    const { tagDeclarations } = await discoverTagSources(reader);
    expect(tagDeclarations).toEqual([{ value: 'who:nocv', name: 'No CV', description: undefined }]);
  });

  it('finds a nested .tag.yaml declaration', async () => {
    const reader = makeTreeReaderFromFiles({
      'what/topics/design.tag.yaml': 'name: Design\ndescription: Design-related writing\n',
    });
    const { tagDeclarations } = await discoverTagSources(reader);
    expect(tagDeclarations).toEqual([
      { value: 'what:topics/design', name: 'Design', description: 'Design-related writing' },
    ]);
  });

  it('discovers multiple sources across sibling and nested directories', async () => {
    const reader = makeTreeReaderFromFiles({
      'what/puzzles/_config.yaml': 'name: Puzzles\n',
      'what/topics/design.tag.yaml': 'name: Design\n',
      'who/nocv.tag.yaml': 'name: No CV\n',
    });
    const { containerIdentities, tagDeclarations } = await discoverTagSources(reader);
    expect(containerIdentities.map(c => c.value)).toEqual(['what:puzzles']);
    expect(tagDeclarations.map(d => d.value).sort()).toEqual(['what:topics/design', 'who:nocv']);
  });

  it('returns empty results for an empty tree', async () => {
    const reader = makeTreeReaderFromFiles({});
    const result = await discoverTagSources(reader);
    expect(result).toEqual({ containerIdentities: [], tagDeclarations: [], dimensionGroupOrder: {} });
  });

  it('captures a group from a container _config.yaml', async () => {
    const reader = makeTreeReaderFromFiles({
      'where/contact/_config.yaml': 'name: Contact\ngroup: Reach me\n',
    });
    const { containerIdentities } = await discoverTagSources(reader);
    expect(containerIdentities).toEqual([
      { value: 'where:contact', name: 'Contact', description: undefined, group: 'Reach me' },
    ]);
  });

  it('captures a group from a .tag.yaml declaration', async () => {
    const reader = makeTreeReaderFromFiles({
      'what/topics/design.tag.yaml': 'name: Design\ngroup: Themes\n',
    });
    const { tagDeclarations } = await discoverTagSources(reader);
    expect(tagDeclarations).toEqual([
      { value: 'what:topics/design', name: 'Design', description: undefined, group: 'Themes', order: undefined },
    ]);
  });

  it('captures a numeric order from a .tag.yaml declaration', async () => {
    const reader = makeTreeReaderFromFiles({
      'when/released.tag.yaml': 'name: Released\norder: 2\n',
    });
    const { tagDeclarations } = await discoverTagSources(reader);
    expect(tagDeclarations[0].order).toBe(2);
  });

  it('captures a numeric order from a container _config.yaml', async () => {
    const reader = makeTreeReaderFromFiles({
      'what/puzzles/_config.yaml': 'name: Puzzles\norder: 1\n',
    });
    const { containerIdentities } = await discoverTagSources(reader);
    expect(containerIdentities[0].order).toBe(1);
  });

  it('ignores a non-numeric order', async () => {
    const reader = makeTreeReaderFromFiles({
      'when/released.tag.yaml': 'name: Released\norder: soon\n',
    });
    const { tagDeclarations } = await discoverTagSources(reader);
    expect(tagDeclarations[0].order).toBeUndefined();
  });
});

describe('getDimensionGroupOrder', () => {
  it('reads groupOrder from a dimension-root _config.yaml', async () => {
    const reader = makeTreeReaderFromFiles({
      'where/_config.yaml': 'groupOrder:\n  - Locations\n  - Reach me\n',
    });
    const order = await getDimensionGroupOrder(reader);
    expect(order).toEqual({ where: ['Locations', 'Reach me'] });
  });

  it('ignores a non-dimension directory _config.yaml groupOrder', async () => {
    const reader = makeTreeReaderFromFiles({
      'where/contact/_config.yaml': 'name: Contact\ngroupOrder:\n  - Nope\n',
    });
    const order = await getDimensionGroupOrder(reader);
    expect(order).toEqual({});
  });

  it('returns an empty map when no dimension declares groupOrder', async () => {
    const reader = makeTreeReaderFromFiles({
      'where/contact/_config.yaml': 'name: Contact\n',
    });
    const order = await getDimensionGroupOrder(reader);
    expect(order).toEqual({});
  });
});

describe('getTagRegistry', () => {
  it('wires discovered sources into the computed registry', async () => {
    const reader = makeTreeReaderFromFiles({
      'what/puzzles/_config.yaml': 'name: Puzzles\ndescription: Logic puzzles\n',
    });
    const cards = [fakeCardMeta({ uid: 'what/puzzles/sudoku', tags: ['what:puzzles'] })];
    const registry = await getTagRegistry(cards, reader);
    expect(registry.what.values).toContain('what:puzzles');
    expect(registry.what.display.get('what:puzzles')).toEqual({ name: 'Puzzles', description: 'Logic puzzles', declared: true });
  });
});

// ---------------------------------------------------------------------------
// Parity — the dimension panel's value list is unchanged by the migration
// ---------------------------------------------------------------------------
//
// Before this migration, extractDimensionTags's `declaredValues` param was
// fed slash-form ids straight from `getCollection('tag')` (e.g.
// "what/projects/edtech"), converted to colon-form internally. Now it's fed
// the tag registry's per-dimension `values` list directly (already colon-
// form, aggregating container _config.yaml + .tag.yaml + used tags). This
// test guards that swap: for an equivalent set of declarations, the panel's
// resulting value list — union of declared and used — is identical either
// way, so no value is silently dropped or duplicated by the migration.
describe('parity — registry-fed value list matches the pre-migration shape', () => {
  it('produces the same dimension value list whether values come from real declarations or the fixture tag collection they replace', () => {
    const cards = [
      fakeCardMeta({ uid: 'what/posts/a', tags: ['what:posts'] }),
      fakeCardMeta({ uid: 'what/writing/b', tags: ['what:projects/edtech'] }), // used-but-undeclared value
      fakeCardMeta({ uid: 'what/puzzles/sudoku', tags: ['what:puzzles'] }),
    ];

    // Mirrors what the old `tag` collection declared for these values (name
    // only matters for display, not the value list — see tag-registry.ts).
    const containerIdentities = [{ value: 'what:puzzles', name: 'Puzzles' }];
    const tagDeclarations = [{ value: 'what:posts', name: 'Posts' }];

    const registry = computeTagRegistry(cards, containerIdentities, tagDeclarations);

    // Pre-migration equivalent: the same declared ids, in the old slash-form,
    // converted to colon-form exactly as tagIdToFilterValue used to.
    const oldStyleDeclaredValues = ['what:puzzles', 'what:posts'];

    const registryFed = extractDimensionTags(cards, 'what', registry.what.values);
    const oldStyleFed = extractDimensionTags(cards, 'what', oldStyleDeclaredValues);

    expect(registryFed).toEqual(oldStyleFed);
    // And critically, the used-but-undeclared value still appears (union of used tags) —
    // this is the "undeclared-but-used values still appear" acceptance criterion.
    expect(registryFed).toContain('what:projects/edtech');
  });
});
