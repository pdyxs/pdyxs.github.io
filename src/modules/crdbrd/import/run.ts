import { newEnvelope, validateEnvelope } from '../../../lib/dev-editors/envelope.ts';
import { crdbrdEditor } from '../definition.ts';
import { map } from './map.ts';
import { readDump, type ReadFs } from './read.ts';

export interface RunFs extends ReadFs {
  exists(path: string): Promise<boolean>;
  readBytes(path: string): Promise<Uint8Array>;
  writeBytes(path: string, bytes: Uint8Array): Promise<void>;
  /** Atomic: write `<path>.tmp`, then rename. */
  writeText(path: string, text: string): Promise<void>;
}

export interface RunOptions {
  fs: RunFs;
  dumpDir: string;
  gameId: string;
  cardDir: string;
  force: boolean;
}

export async function runImport(opts: RunOptions): Promise<{ warnings: string[] }> {
  const { fs, gameId } = opts;
  const dumpDir = opts.dumpDir.replace(/\/+$/, '');
  const cardDir = opts.cardDir.replace(/\/+$/, '');
  if (!(await fs.exists(`${cardDir}/index.md`))) throw new Error(`${cardDir} has no index.md: it is not a card folder`);
  if (!opts.force && (await fs.exists(`${cardDir}/index.json`))) {
    throw new Error(`${cardDir}/index.json already exists; pass --force to overwrite it`);
  }
  const { game, images, warnings } = map(await readDump(fs, dumpDir, gameId));

  const envelope = { ...newEnvelope(crdbrdEditor), data: game };
  const problems = validateEnvelope(crdbrdEditor, envelope);
  if (problems.length) throw new Error(`the mapped game is not valid crdbrd data, nothing written: ${problems.join('; ')}`);
  const text = JSON.stringify(envelope, null, 2) + '\n';
  for (const { from, to } of images) {
    if (!(await fs.exists(`${dumpDir}/${from}`))) {
      warnings.push(`image file "${from}" is not in the dump; "${to}" will be missing from the card folder`);
      continue;
    }
    await fs.writeBytes(`${cardDir}/${to}`, await fs.readBytes(`${dumpDir}/${from}`));
  }
  await fs.writeText(`${cardDir}/index.json`, text);
  return { warnings };
}
