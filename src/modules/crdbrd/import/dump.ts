// One-off dump of the old crdbrd.design Firebase data (Firestore + Storage) to
// a local folder. Pure of any Firebase import: Firestore and Storage arrive as
// the small interfaces below (the admin SDK satisfies DocRef/CollRef as-is;
// scripts/crdbrd-dump.mjs adapts Storage). Nothing here is loaded by the site.

export interface DocSnapshot {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
export interface DocRef {
  id: string;
  get(): Promise<DocSnapshot>;
  listCollections(): Promise<CollRef[]>;
}
export interface CollRef {
  id: string;
  listDocuments(): Promise<DocRef[]>;
}
export interface FirestoreLike {
  collection(id: string): CollRef;
  doc(path: string): DocRef;
}
export interface StorageLike {
  listFiles(prefix: string): Promise<string[]>;
  read(name: string): Promise<Uint8Array>;
}
export interface DumpFs {
  mkdir(path: string, opts: { recursive: true }): Promise<unknown>;
  writeFile(path: string, data: string | Uint8Array): Promise<unknown>;
}

export interface DumpOptions {
  firestore: FirestoreLike;
  storage: StorageLike;
  outDir: string;
  fs: DumpFs;
  game?: string;
  now?: () => Date;
}

export interface Manifest {
  dumpedAt: string;
  documents: number;
  files: number;
  games: { id: string; name: string | null; documents: number; files: number }[];
}

/** Resolve `rel` under `outDir`, throwing if it would land anywhere else. */
export function safeJoin(outDir: string, rel: string): string {
  const segs: string[] = [];
  for (const s of `${outDir.replace(/\/+$/, '')}/${rel}`.split('/')) {
    if (s === '' || s === '.') continue;
    if (s === '..') {
      segs.pop();
      continue;
    }
    segs.push(s);
  }
  const root = outDir.replace(/\/+$/, '');
  const joined = '/' + segs.join('/');
  if (!outDir.startsWith('/') || !joined.startsWith(root + '/')) {
    throw new Error(`refusing to write outside outDir: ${rel}`);
  }
  return joined;
}

/** True when `dir` is `repoRoot` or inside it (both absolute, normalised). */
export function isInside(dir: string, repoRoot: string): boolean {
  const d = dir.replace(/\/+$/, '');
  const r = repoRoot.replace(/\/+$/, '');
  return d === r || d.startsWith(r + '/');
}

function replacer(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (typeof v.toDate === 'function') {
      return { __timestamp: (v.toDate as () => Date)().toISOString() };
    }
    if (typeof v.path === 'string' && 'firestore' in v) return { __ref: v.path };
  }
  return value;
}

function dirOf(p: string): string {
  return p.slice(0, p.lastIndexOf('/'));
}

export async function dump(opts: DumpOptions): Promise<Manifest> {
  const { firestore, storage, outDir, fs } = opts;
  const now = opts.now ?? (() => new Date());

  async function write(rel: string, data: string | Uint8Array) {
    const path = safeJoin(outDir, rel);
    await fs.mkdir(dirOf(path), { recursive: true });
    await fs.writeFile(path, data);
  }

  async function walkDoc(doc: DocRef, path: string): Promise<{ docs: number; name: unknown }> {
    const snap = await doc.get();
    let docs = 0;
    let name: unknown = null;
    if (snap.exists) {
      const data = snap.data() ?? {};
      await write(`${path}.json`, JSON.stringify(data, replacer, 2));
      docs++;
      name = data.name ?? null;
    }
    // Listing a document never returns its subcollections; ask for them.
    for (const col of await doc.listCollections()) {
      for (const child of await col.listDocuments()) {
        docs += (await walkDoc(child, `${path}/${col.id}/${child.id}`)).docs;
      }
    }
    return { docs, name };
  }

  const gameDocs = opts.game
    ? [firestore.doc(`games/${opts.game}`)]
    : await firestore.collection('games').listDocuments();

  const manifest: Manifest = { dumpedAt: now().toISOString(), documents: 0, files: 0, games: [] };
  for (const game of gameDocs) {
    const { docs, name } = await walkDoc(game, `games/${game.id}`);
    let files = 0;
    for (const name of await storage.listFiles(`images/${game.id}/`)) {
      await write(name, await storage.read(name));
      files++;
    }
    manifest.games.push({ id: game.id, name: typeof name === 'string' ? name : null, documents: docs, files });
    manifest.documents += docs;
    manifest.files += files;
  }
  await write('manifest.json', JSON.stringify(manifest, null, 2));
  return manifest;
}
