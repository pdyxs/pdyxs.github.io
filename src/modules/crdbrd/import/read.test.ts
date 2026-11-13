import { describe, expect, it } from 'vitest';
import { readDump, type ReadFs } from './read.ts';

function memFs(files: Record<string, unknown>): ReadFs {
  return {
    async readText(p) {
      if (!(p in files)) throw new Error(`ENOENT ${p}`);
      return JSON.stringify(files[p]);
    },
    async list(dir) {
      const prefix = dir.replace(/\/$/, '') + '/';
      return [...new Set(Object.keys(files).filter((f) => f.startsWith(prefix)).map((f) => f.slice(prefix.length).split('/')[0]))];
    },
  };
}

describe('readDump', () => {
  it('assembles a game from the dump folder layout, ids taken from file names', async () => {
    const fs = memFs({
      '/d/games/g1.json': { name: 'Time Fight', owner: 'x' },
      '/d/games/g1/properties/p1.json': { name: 'Goal', type: 'text', active: true },
      '/d/games/g1/images/i1.json': { name: 'a.png', path: 'images/g1/a.png' },
      '/d/games/g1/concepts/c1.json': { name: 'Hero', active: true },
      '/d/games/g1/concepts/c1/properties/p2.json': { name: 'HP', type: 'number' },
      '/d/games/g1/concepts/c1/entities/e1.json': { name: 'Ada' },
      '/d/games/g1/components/s1.json': { name: 'Deck' },
      '/d/games/g1/components/s1/properties/p3.json': { name: 'Title', type: 'text' },
      '/d/games/g1/components/s1/specifications/k1.json': { count: 2 },
      '/d/games/g1/set/s1/specifications/k2.json': { count: 5 },
      '/d/games/g1/concepts/c1/entities/notjson.txt': 'ignored',
    });
    const g = await readDump(fs, '/d', 'g1');
    expect(g.id).toBe('g1');
    expect(g.doc).toEqual({ name: 'Time Fight', owner: 'x' });
    expect(g.properties).toEqual([{ id: 'p1', name: 'Goal', type: 'text', active: true }]);
    expect(g.images).toEqual([{ id: 'i1', name: 'a.png', path: 'images/g1/a.png' }]);
    expect(g.concepts).toEqual([{ id: 'c1', name: 'Hero', active: true, properties: [{ id: 'p2', name: 'HP', type: 'number' }], entities: [{ id: 'e1', name: 'Ada' }] }]);
    expect(g.sets).toEqual([{
      id: 's1', name: 'Deck',
      properties: [{ id: 'p3', name: 'Title', type: 'text' }],
      specifications: [{ id: 'k1', count: 2 }, { id: 'k2', count: 5 }],
    }]);
  });

  it('reads a game with nothing but its own document', async () => {
    const g = await readDump(memFs({ '/d/games/g2.json': { name: 'Teppanyaki' } }), '/d', 'g2');
    expect(g).toEqual({ id: 'g2', doc: { name: 'Teppanyaki' }, properties: [], concepts: [], sets: [], images: [] });
  });

  it('says so when the game is not in the dump', async () => {
    await expect(readDump(memFs({ '/d/games/g1.json': {} }), '/d', 'nope')).rejects.toThrow(/nope/);
  });
});
