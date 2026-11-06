/**
 * The `main`-only publish assertion, CLI half (docs/plans/publishing-pipeline.md
 * §6, issue #177). Scans every card under src/content and exits 1 if any has
 * `inspected` other than `true` (absent counts). The decision lives in
 * src/lib/site/inspected-gate.ts; this only walks the tree and reports.
 *
 *   node scripts/assert-inspected.mjs [contentRoot]
 *
 * Run by build.yml before the build, on `main` only. Deliberately NOT part of
 * `astro build`, which also runs on build.pdyxs.wtf, the surface built to
 * review uninspected content.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import matter from 'gray-matter';
import { uninspectedCards } from '../src/lib/site/inspected-gate.ts';
import { isVaultInfrastructurePath } from '../src/lib/content/folders/content-glob.ts';
import { uidFromContentPath } from '../src/lib/content/folders/content-uid.ts';
import { FIVE_W_DIMENSIONS } from '../src/lib/content/tags/five-w.ts';

function* markdownFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* markdownFiles(full);
    else if (/\.(md|mdx)$/i.test(entry.name)) yield full;
  }
}

function main() {
  const root = process.argv[2] ?? 'src/content';
  const cards = [];
  for (const dim of FIVE_W_DIMENSIONS) {
    let files;
    try {
      files = [...markdownFiles(join(root, dim))];
    } catch {
      continue; // a dimension with no folder yet
    }
    for (const file of files) {
      const rel = relative(root, file);
      if (isVaultInfrastructurePath(rel)) continue;
      cards.push({
        uid: uidFromContentPath(rel.split('\\').join('/')),
        inspected: matter(readFileSync(file, 'utf8')).data?.inspected,
      });
    }
  }

  const bad = uninspectedCards(cards);
  if (bad.length > 0) {
    console.error(`assert-inspected: ${bad.length} of ${cards.length} card(s) are not inspected: true`);
    for (const uid of bad) console.error(`::error::not inspected: ${uid}`);
    process.exit(1);
  }
  console.log(`assert-inspected: all ${cards.length} cards are inspected.`);
}

main();
