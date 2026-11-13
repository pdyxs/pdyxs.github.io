// Node entry for scripts/crdbrd-import. Reads a game from the folder
// scripts/crdbrd-dump wrote, maps it to crdbrd data, copies its images into a
// card folder and writes the card's index.json. All logic is in
// src/modules/crdbrd/import/; this adapts node's fs to it.
import { access, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runImport } from '../src/modules/crdbrd/import/run.ts';

const args = process.argv.slice(2);
const force = args.includes('--force');
const [dumpDir, gameId, cardDir] = args.filter((a) => a !== '--force');
if (!dumpDir || !gameId || !cardDir) {
  console.error('Usage: scripts/crdbrd-import <dumpDir> <gameId> <cardDir> [--force]');
  process.exit(2);
}

const fs = {
  readText: (p) => readFile(p, 'utf8'),
  readBytes: async (p) => new Uint8Array(await readFile(p)),
  async list(dir) {
    try {
      return await readdir(dir);
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
  },
  exists: (p) => access(p).then(() => true, () => false),
  async writeBytes(p, bytes) {
    await mkdir(resolve(p, '..'), { recursive: true });
    await writeFile(p, bytes);
  },
  async writeText(p, text) {
    await writeFile(`${p}.tmp`, text);
    await rename(`${p}.tmp`, p);
  },
};

try {
  const { warnings } = await runImport({ fs, dumpDir: resolve(dumpDir), gameId, cardDir: resolve(cardDir), force });
  console.log(`Imported game ${gameId} into ${resolve(cardDir)}/index.json`);
  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`  - ${w}`);
  } else console.log('No warnings.');
} catch (e) {
  console.error(`Import failed: ${e.message}`);
  process.exit(1);
}
