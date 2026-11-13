import { describe, expect, it } from 'vitest';
import { validate } from '../model/validate.ts';
import { map, type DumpGame } from './map.ts';

const dumpGame = (over: Partial<DumpGame> = {}): DumpGame => ({
  id: 'g1',
  doc: { name: 'Time Fight', owner: 'p@example.com' },
  properties: [],
  concepts: [],
  sets: [],
  images: [],
  ...over,
});

describe('map', () => {
  it('maps an empty game to a valid game with its name and no warnings', () => {
    const out = map(dumpGame());
    expect(out.game).toEqual({ name: 'Time Fight', properties: [], values: {}, concepts: [], sets: [] });
    expect(out.images).toEqual([]);
    expect(out.warnings).toEqual([]);
    expect(validate(out.game)).toEqual([]);
  });

  describe('properties and values', () => {
    it('maps a number property with its bounds, and a stored value', () => {
      const out = map(dumpGame({
        doc: { name: 'G', hp: 4 },
        properties: [{ id: 'hp', active: true, name: 'Health', type: 'number', min: 1, max: 9 }],
      }));
      expect(out.game.properties).toEqual([{ id: 'hp', name: 'Health', type: { kind: 'number', min: 1, max: 9 } }]);
      expect(out.game.values).toEqual({ hp: 4 });
      expect(validate(out.game)).toEqual([]);
    });

    it('maps text and boolean properties and values', () => {
      const out = map(dumpGame({
        doc: { name: 'G', t: 'hello', b: true },
        properties: [
          { id: 't', active: true, name: 'Tagline', type: 'text' },
          { id: 'b', active: true, name: 'Beta', type: 'boolean' },
        ],
      }));
      expect(out.game.properties.map((p) => p.type)).toEqual([{ kind: 'text' }, { kind: 'boolean' }]);
      expect(out.game.values).toEqual({ t: 'hello', b: true });
      expect(validate(out.game)).toEqual([]);
    });

    it('maps an {r,g,b,a} colour to a hex colour, warning when alpha is lost', () => {
      const out = map(dumpGame({
        doc: { name: 'G', c1: { r: 255, g: 128, b: 0, a: 1 }, c2: { r: 0, g: 0, b: 255, a: 0.5 } },
        properties: [
          { id: 'c1', active: true, name: 'Ink', type: 'colour' },
          { id: 'c2', active: true, name: 'Wash', type: 'colour' },
        ],
      }));
      expect(out.game.properties.map((p) => p.type)).toEqual([{ kind: 'colour' }, { kind: 'colour' }]);
      expect(out.game.values).toEqual({ c1: '#ff8000', c2: '#0000ff' });
      expect(out.warnings).toHaveLength(1);
      expect(out.warnings[0]).toMatch(/Wash/);
      expect(out.warnings[0]).toMatch(/alpha|transparen/i);
      expect(validate(out.game)).toEqual([]);
    });
  });

  describe('concepts', () => {
    it('keeps nested concepts, their properties, and their entities with values', () => {
      const out = map(dumpGame({
        concepts: [
          { id: 'hero', active: true, name: 'Hero', properties: [{ id: 'atk', active: true, name: 'Attack', type: 'number', min: 0, max: 5 }],
            entities: [{ id: 'e1', active: true, name: 'Ada', atk: 3 }, { id: 'e2', active: true, name: 'Bo' }] },
          { id: 'item', active: true, name: 'Item', parent: 'hero', properties: [], entities: [{ id: 'e3', active: true, name: 'Sword' }] },
        ],
      }));
      expect(out.game.concepts).toEqual([
        {
          id: 'hero', name: 'Hero', count: 2,
          properties: [{ id: 'atk', name: 'Attack', type: { kind: 'number', min: 0, max: 5 } }],
          entities: [{ id: 'e1', name: 'Ada', values: { atk: 3 } }, { id: 'e2', name: 'Bo', values: {} }],
          children: [{ id: 'item', name: 'Item', count: 1, properties: [], entities: [{ id: 'e3', name: 'Sword', values: {} }], children: [] }],
        },
      ]);
      expect(out.warnings).toEqual([]);
      expect(validate(out.game)).toEqual([]);
    });

    it('skips soft-deleted docs (active: false) without a warning', () => {
      const out = map(dumpGame({
        concepts: [
          { id: 'a', active: true, name: 'Kept', properties: [{ id: 'p', active: false, name: 'Gone', type: 'text' }], entities: [{ id: 'e', active: false, name: 'Gone' }] },
          { id: 'b', active: false, name: 'Deleted', properties: [], entities: [] },
        ],
      }));
      expect(out.game.concepts.map((c) => c.id)).toEqual(['a']);
      expect(out.game.concepts[0].properties).toEqual([]);
      expect(out.game.concepts[0].entities).toEqual([]);
      expect(out.warnings).toEqual([]);
    });

    it('puts a concept whose parent is missing at the top level, with a warning', () => {
      const out = map(dumpGame({
        concepts: [
          { id: 'a', active: true, name: 'Root', properties: [], entities: [] },
          { id: 'b', active: true, name: 'Lost', parent: 'deleted', properties: [], entities: [] },
        ],
      }));
      expect(out.game.concepts.map((c) => c.id)).toEqual(['a', 'b']);
      expect(out.warnings).toHaveLength(1);
      expect(out.warnings[0]).toMatch(/Lost/);
      expect(validate(out.game)).toEqual([]);
    });

    it('breaks a parent cycle at the top level, with a warning, and keeps every concept', () => {
      const out = map(dumpGame({
        concepts: [
          { id: 'a', active: true, name: 'A', parent: 'b', properties: [], entities: [] },
          { id: 'b', active: true, name: 'B', parent: 'a', properties: [], entities: [] },
        ],
      }));
      const ids = (list: { id: string; children: unknown[] }[]): string[] => list.flatMap((c) => [c.id, ...ids(c.children as { id: string; children: unknown[] }[])]);
      expect(ids(out.game.concepts).sort()).toEqual(['a', 'b']);
      expect(out.warnings.length).toBeGreaterThan(0);
      expect(validate(out.game)).toEqual([]);
    });
  });

  describe('entity properties', () => {
    const concepts = [{ id: 'hero', active: true, name: 'Hero', properties: [], entities: [{ id: 'e1', active: true, name: 'Ada' }] }];

    it('maps an entity property to a reference to its concept, with the entity id as value', () => {
      const out = map(dumpGame({
        doc: { name: 'G', fav: 'e1' },
        properties: [{ id: 'fav', active: true, name: 'Favourite', type: 'entity', concept: 'hero' }],
        concepts,
      }));
      expect(out.game.properties).toEqual([{ id: 'fav', name: 'Favourite', type: { kind: 'reference', concept: 'hero' } }]);
      expect(out.game.values).toEqual({ fav: 'e1' });
      expect(out.warnings).toEqual([]);
      expect(validate(out.game)).toEqual([]);
    });

    it('drops an entity property with no concept, and its values, with a warning', () => {
      const out = map(dumpGame({
        doc: { name: 'G', fav: 'e1' },
        properties: [{ id: 'fav', active: true, name: 'Favourite', type: 'entity', concept: '' }],
        concepts,
      }));
      expect(out.game.properties).toEqual([]);
      expect(out.game.values).toEqual({});
      expect(out.warnings).toHaveLength(1);
      expect(out.warnings[0]).toMatch(/Favourite/);
      expect(validate(out.game)).toEqual([]);
    });

    it('treats an empty entity value as none, and warns about one that points at a missing entity', () => {
      const out = map(dumpGame({
        doc: { name: 'G', a: '', b: 'gone' },
        properties: [
          { id: 'a', active: true, name: 'A', type: 'entity', concept: 'hero' },
          { id: 'b', active: true, name: 'B', type: 'entity', concept: 'hero' },
        ],
        concepts,
      }));
      expect(out.game.values).toEqual({ a: null, b: null });
      expect(out.warnings).toHaveLength(1);
      expect(out.warnings[0]).toMatch(/"B"/);
    });
  });

  it('drops a property of an unknown type, with a warning', () => {
    const out = map(dumpGame({
      doc: { name: 'G', x: 1 },
      properties: [{ id: 'x', active: true, name: 'Mystery', type: 'hologram' }],
    }));
    expect(out.game.properties).toEqual([]);
    expect(out.game.values).toEqual({});
    expect(out.warnings).toHaveLength(1);
    expect(out.warnings[0]).toMatch(/Mystery/);
  });

  describe('images', () => {
    const images = [
      { id: 'im1', active: true, name: 'cover.png', path: 'images/g1/aaa-111.png', url: 'https://example.invalid/x' },
      { id: 'im2', active: true, name: 'back.jpg', path: 'images/g1/bbb-222.jpg', url: 'https://example.invalid/y' },
    ];

    it('maps image ids to filenames and lists each file to copy once', () => {
      const out = map(dumpGame({
        doc: { name: 'G', logo: 'im1', empty: '' },
        properties: [
          { id: 'logo', active: true, name: 'Logo', type: 'image' },
          { id: 'empty', active: true, name: 'Nothing', type: 'image' },
          { id: 'mark', active: true, name: 'Mark', type: 'image' },
        ],
        concepts: [{ id: 'c', active: true, name: 'C', properties: [{ id: 'art', active: true, name: 'Art', type: 'image' }],
          entities: [{ id: 'e1', active: true, name: 'One', art: 'im1' }, { id: 'e2', active: true, name: 'Two', art: 'im2' }] }],
        images,
      }));
      expect(out.game.properties[0].type).toEqual({ kind: 'image' });
      expect(out.game.values).toEqual({ logo: 'aaa-111.png', empty: null });
      expect(out.game.concepts[0].entities.map((e) => e.values)).toEqual([{ art: 'aaa-111.png' }, { art: 'bbb-222.jpg' }]);
      expect(out.images).toEqual([
        { from: 'images/g1/aaa-111.png', to: 'aaa-111.png' },
        { from: 'images/g1/bbb-222.jpg', to: 'bbb-222.jpg' },
      ]);
      expect(out.warnings).toEqual([]);
      expect(validate(out.game)).toEqual([]);
    });

    it('leaves an image empty, with a warning, when its image record is missing', () => {
      const out = map(dumpGame({
        doc: { name: 'G', logo: 'nope' },
        properties: [{ id: 'logo', active: true, name: 'Logo', type: 'image' }],
        images,
      }));
      expect(out.game.values).toEqual({ logo: null });
      expect(out.images).toEqual([]);
      expect(out.warnings).toHaveLength(1);
      expect(out.warnings[0]).toMatch(/Logo/);
    });

    it('warns about an image the card editor cannot serve (unsupported extension)', () => {
      const out = map(dumpGame({
        doc: { name: 'G', logo: 'im3' },
        properties: [{ id: 'logo', active: true, name: 'Logo', type: 'image' }],
        images: [{ id: 'im3', active: true, name: 'x.bmp', path: 'images/g1/ccc.bmp' }],
      }));
      expect(out.game.values).toEqual({ logo: 'ccc.bmp' });
      expect(out.warnings).toHaveLength(1);
      expect(out.warnings[0]).toMatch(/\.bmp/);
    });
  });

  describe('sets and specifications', () => {
    const concepts = [{ id: 'hero', active: true, name: 'Hero', properties: [], entities: [{ id: 'e1', active: true, name: 'Ada' }] }];

    it('maps sets to component sets, with no template, no size and no per-concepts', () => {
      const out = map(dumpGame({
        concepts,
        sets: [{
          id: 's1', active: true, name: 'Deck',
          properties: [
            { id: 'title', active: true, name: 'Title', type: 'text' },
            { id: 'who', active: true, name: 'Who', type: 'entity', concept: 'hero' },
            { id: 'art', active: true, name: 'Art', type: 'image' },
          ],
          specifications: [
            { id: 'k1', active: true, count: 3, title: 'Strike', who: 'e1', art: 'im1' },
            { id: 'k2', active: true, count: 1 },
          ],
        }],
        images: [{ id: 'im1', active: true, name: 'a.png', path: 'images/g1/a.png' }],
      }));
      expect(out.game.sets).toEqual([{
        id: 's1', name: 'Deck', substitute: '',
        properties: [
          { id: 'title', name: 'Title', type: { kind: 'text' } },
          { id: 'who', name: 'Who', type: { kind: 'reference', concept: 'hero' } },
          { id: 'art', name: 'Art', type: { kind: 'image' } },
        ],
        components: [
          { id: 'k1', name: 'Strike', count: 3, per: [], values: { title: 'Strike', who: 'e1', art: 'a.png' } },
          { id: 'k2', name: 'Specification 2', count: 1, per: [], values: {} },
        ],
        children: [],
      }]);
      expect(out.game.sets![0]).not.toHaveProperty('template');
      expect(out.game.sets![0]).not.toHaveProperty('size');
      expect(out.warnings).toEqual([]);
      expect(validate(out.game)).toEqual([]);
    });

    it('nests sets by parent', () => {
      const out = map(dumpGame({
        sets: [
          { id: 'board', active: true, name: 'Board', properties: [], specifications: [] },
          { id: 'sq', active: true, name: 'Square', parent: 'board', properties: [], specifications: [] },
        ],
      }));
      expect(out.game.sets![0].children.map((c) => c.id)).toEqual(['sq']);
      expect(validate(out.game)).toEqual([]);
    });

    it('defaults a missing count to 1, and shows 0 as the old tool did (1), with a warning', () => {
      const out = map(dumpGame({
        sets: [{ id: 's', active: true, name: 'S', properties: [], specifications: [{ id: 'a', active: true }, { id: 'b', active: true, count: 0 }, { id: 'c', active: true, count: 2.5 }] }],
      }));
      expect(out.game.sets![0].components.map((c) => c.count)).toEqual([1, 1, 3]);
      expect(out.warnings).toHaveLength(2);
      expect(validate(out.game)).toEqual([]);
    });

    it('ignores soft-deleted specifications and set properties', () => {
      const out = map(dumpGame({
        sets: [{ id: 's', active: true, name: 'S', properties: [{ id: 'p', active: false, name: 'P', type: 'text' }], specifications: [{ id: 'a', active: false, count: 2, p: 'x' }] }],
      }));
      expect(out.game.sets![0].properties).toEqual([]);
      expect(out.game.sets![0].components).toEqual([]);
      expect(out.warnings).toEqual([]);
    });
  });

  it('repairs number bounds that are missing, not numbers, or the wrong way round, with a warning for the last two', () => {
    const out = map(dumpGame({
      properties: [
        { id: 'a', active: true, name: 'NoBounds', type: 'number' },
        { id: 'b', active: true, name: 'Swapped', type: 'number', min: 9, max: 2 },
        { id: 'c', active: true, name: 'Junk', type: 'number', min: 'x', max: null },
      ],
    }));
    expect(out.game.properties.map((p) => p.type)).toEqual([
      { kind: 'number', min: 0, max: 10 },
      { kind: 'number', min: 2, max: 9 },
      { kind: 'number', min: 0, max: 10 },
    ]);
    expect(out.warnings).toHaveLength(2);
    expect(validate(out.game)).toEqual([]);
  });
});
