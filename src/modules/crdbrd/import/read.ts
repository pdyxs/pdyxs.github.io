// Reads one game out of the folder scripts/crdbrd-dump wrote: one JSON file per
// Firestore document, mirroring the collection path. Fs is injected, so this
// is testable in memory.

import type { Doc, DumpConcept, DumpGame, DumpSet } from './map.ts';

export interface ReadFs {
  readText(path: string): Promise<string>;
  /** Entry names directly under `dir`; empty when it does not exist. */
  list(dir: string): Promise<string[]>;
}

export async function readDump(fs: ReadFs, dumpDir: string, gameId: string): Promise<DumpGame> {
  const root = `${dumpDir.replace(/\/+$/, '')}/games/${gameId}`;
  const readDoc = async (path: string, id: string): Promise<Doc> => ({ ...JSON.parse(await fs.readText(path)), id });
  /** Every `<id>.json` under `dir` as a doc, in id order. */
  const readDocs = async (dir: string): Promise<Doc[]> => {
    const names = (await fs.list(dir)).filter((n) => n.endsWith('.json')).sort();
    return Promise.all(names.map((n) => readDoc(`${dir}/${n}`, n.slice(0, -'.json'.length))));
  };

  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(await fs.readText(`${root}.json`));
  } catch {
    throw new Error(`game "${gameId}" is not in the dump (no ${root}.json)`);
  }

  const concepts: DumpConcept[] = [];
  for (const c of await readDocs(`${root}/concepts`)) {
    concepts.push({
      ...c,
      properties: await readDocs(`${root}/concepts/${c.id}/properties`),
      entities: await readDocs(`${root}/concepts/${c.id}/entities`),
    });
  }
  const sets: DumpSet[] = [];
  for (const s of await readDocs(`${root}/components`)) {
    sets.push({
      ...s,
      properties: await readDocs(`${root}/components/${s.id}/properties`),
      // The old code reads specifications from `set/<id>` while it reads sets from `components`; take either.
      specifications: [...(await readDocs(`${root}/components/${s.id}/specifications`)), ...(await readDocs(`${root}/set/${s.id}/specifications`))],
    });
  }
  return { id: gameId, doc, properties: await readDocs(`${root}/properties`), concepts, sets, images: await readDocs(`${root}/images`) };
}
