import { describe, expect, it } from 'vitest';
import { dump, isInside, type DocRef, type CollRef, type DumpFs } from './dump.ts';

type Tree = { [col: string]: { [id: string]: { data?: Record<string, unknown>; cols?: Tree } } };

function fakeCollection(id: string, tree: Tree[string]): CollRef {
  return {
    id,
    async listDocuments() {
      return Object.keys(tree).map((docId) => fakeDoc(docId, tree[docId]));
    },
  };
}
function fakeDoc(id: string, node: Tree[string][string]): DocRef {
  return {
    id,
    async get() {
      return { exists: !!node.data, data: () => node.data ?? {} };
    },
    async listCollections() {
      return Object.keys(node.cols ?? {}).map((c) => fakeCollection(c, node.cols![c]));
    },
  };
}
function fakeFirestore(tree: Tree) {
  return {
    collection: (id: string) => fakeCollection(id, tree[id] ?? {}),
    doc(path: string): DocRef {
      const parts = path.split('/');
      let node: Tree[string][string] = { cols: tree };
      for (let i = 0; i < parts.length; i += 2) {
        node = node.cols![parts[i]][parts[i + 1]];
      }
      return fakeDoc(parts[parts.length - 1], node);
    },
  };
}
function memFs() {
  const files = new Map<string, string | Uint8Array>();
  const fs: DumpFs = {
    async mkdir() {},
    async writeFile(p, d) {
      files.set(p, d);
    },
  };
  return { files, fs };
}
const noStorage = { listFiles: async () => [] as string[], read: async () => new Uint8Array() };

const tree: Tree = {
  games: {
    g1: {
      data: { name: 'Time Fight' },
      cols: {
        concepts: { c1: { data: { name: 'Hero' } } },
        set: {
          s1: {
            data: { name: 'Base' },
            cols: { specifications: { sp1: { data: { count: 3 } } } },
          },
        },
      },
    },
    g2: { data: { name: 'Teppanyaki' } },
  },
};

describe('dump', () => {
  it('writes one JSON file per document mirroring the collection path, nested included', async () => {
    const { files, fs } = memFs();
    await dump({ firestore: fakeFirestore(tree), storage: noStorage, outDir: '/out', fs });
    expect(JSON.parse(files.get('/out/games/g1.json') as string)).toEqual({ name: 'Time Fight' });
    expect(JSON.parse(files.get('/out/games/g1/concepts/c1.json') as string)).toEqual({ name: 'Hero' });
    expect(JSON.parse(files.get('/out/games/g1/set/s1/specifications/sp1.json') as string)).toEqual({ count: 3 });
    expect(files.has('/out/games/g2.json')).toBe(true);
  });

  it('dumps only the requested game', async () => {
    const { files, fs } = memFs();
    await dump({ firestore: fakeFirestore(tree), storage: noStorage, outDir: '/out', fs, game: 'g2' });
    expect(files.has('/out/games/g2.json')).toBe(true);
    expect(files.has('/out/games/g1.json')).toBe(false);
  });

  it('copies Storage files under images/{gameId}/', async () => {
    const { files, fs } = memFs();
    const storage = {
      listFiles: async (prefix: string) => (prefix === 'images/g1/' ? ['images/g1/a.png', 'images/g1/sub/b.png'] : []),
      read: async (name: string) => new TextEncoder().encode('bytes:' + name),
    };
    await dump({ firestore: fakeFirestore(tree), storage, outDir: '/out', fs });
    expect(new TextDecoder().decode(files.get('/out/images/g1/a.png') as Uint8Array)).toBe('bytes:images/g1/a.png');
    expect(files.has('/out/images/g1/sub/b.png')).toBe(true);
  });

  it('writes a manifest with counts, game names and dump time', async () => {
    const { files, fs } = memFs();
    const storage = { listFiles: async (p: string) => (p === 'images/g1/' ? ['images/g1/a.png'] : []), read: async () => new Uint8Array() };
    await dump({ firestore: fakeFirestore(tree), storage, outDir: '/out', fs, now: () => new Date('2026-11-13T00:00:00Z') });
    const m = JSON.parse(files.get('/out/manifest.json') as string);
    expect(m.dumpedAt).toBe('2026-11-13T00:00:00.000Z');
    expect(m.documents).toBe(5);
    expect(m.files).toBe(1);
    expect(m.games).toEqual([
      { id: 'g1', name: 'Time Fight', documents: 4, files: 1 },
      { id: 'g2', name: 'Teppanyaki', documents: 1, files: 0 },
    ]);
  });

  it('recurses through a missing parent doc but writes nothing for it', async () => {
    const { files, fs } = memFs();
    const t: Tree = { games: { g3: { cols: { concepts: { c: { data: { a: 1 } } } } } } };
    await dump({ firestore: fakeFirestore(t), storage: noStorage, outDir: '/out', fs });
    expect(files.has('/out/games/g3.json')).toBe(false);
    expect(files.has('/out/games/g3/concepts/c.json')).toBe(true);
  });

  it('serialises timestamps and document references', async () => {
    const { files, fs } = memFs();
    const t: Tree = { games: { g: { data: { at: { toDate: () => new Date('2020-01-01T00:00:00Z') }, ref: { path: 'games/x', firestore: {} } } } } };
    await dump({ firestore: fakeFirestore(t), storage: noStorage, outDir: '/out', fs });
    expect(JSON.parse(files.get('/out/games/g.json') as string)).toEqual({
      at: { __timestamp: '2020-01-01T00:00:00.000Z' },
      ref: { __ref: 'games/x' },
    });
  });

  it('never writes outside outDir', async () => {
    const { files, fs } = memFs();
    const storage = { listFiles: async () => ['images/g1/../../../evil.txt'], read: async () => new Uint8Array() };
    await expect(
      dump({ firestore: fakeFirestore(tree), storage, outDir: '/out', fs }),
    ).rejects.toThrow(/outside/);
    for (const p of files.keys()) expect(p.startsWith('/out/')).toBe(true);
  });
});

describe('isInside', () => {
  it('flags the repo and anything under it, not siblings', () => {
    expect(isInside('/r', '/r')).toBe(true);
    expect(isInside('/r/out/', '/r')).toBe(true);
    expect(isInside('/r-other', '/r')).toBe(false);
    expect(isInside('/home/x/crdbrd-dump', '/r')).toBe(false);
  });
});
