/**
 * Build step: refreshes the append-only short-code manifest at
 * src/data/stack-manifest.json.
 *
 * Walks src/content directly (not via astro:content, which is only
 * available inside an Astro dev/build process) to enumerate every card and
 * tag uid, then assigns short base62 codes to any uid that doesn't already
 * have one. Existing codes are never reassigned — see src/lib/stack-manifest.ts.
 *
 * Run automatically before `npm run build` (and `npm run dev`) via the
 * "pre*" npm lifecycle scripts in package.json. Safe to run manually:
 *   node scripts/generate-stack-manifest.mjs
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assignCodes } from '../src/lib/stack-manifest.ts';
import { uidFromContentPath, uidFromTagPath } from '../src/lib/content-uid.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(__dirname, '../src/content');
const TAG_DIR = path.join(CONTENT_DIR, 'tag');
const MANIFEST_PATH = path.resolve(__dirname, '../src/data/stack-manifest.json');

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full)));
    } else {
      out.push(full);
    }
  }
  return out;
}

function isUnderscorePrefixed(relPath) {
  return relPath.split(path.sep).some(segment => segment.startsWith('_'));
}

async function collectUids() {
  const allFiles = await walk(CONTENT_DIR);
  const uids = [];

  for (const file of allFiles) {
    const relToContent = path.relative(CONTENT_DIR, file).split(path.sep).join('/');
    if (isUnderscorePrefixed(relToContent)) continue;

    if (relToContent.startsWith('tag/')) {
      if (!/\.yaml$/i.test(relToContent)) continue;
      const relToTag = path.relative(TAG_DIR, file).split(path.sep).join('/');
      uids.push(uidFromTagPath(relToTag));
    } else {
      if (!/\.(md|mdx)$/i.test(relToContent)) continue;
      uids.push(uidFromContentPath(relToContent));
    }
  }

  // A handful of entries have both a "collection/id.md" file and a
  // "collection/id/index.md" file resolving to the same uid (pre-existing
  // content-migration leftovers, not introduced here) — one uid gets one code.
  return [...new Set(uids)].sort();
}

async function loadExistingManifest() {
  try {
    const text = await readFile(MANIFEST_PATH, 'utf-8');
    return JSON.parse(text);
  } catch {
    return [];
  }
}

async function main() {
  const uids = await collectUids();
  const existing = await loadExistingManifest();
  const manifest = assignCodes(existing, uids);

  await mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

  const added = manifest.length - existing.length;
  console.log(`stack-manifest: ${manifest.length} entries (${added} new)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
