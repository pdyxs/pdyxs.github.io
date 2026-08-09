#!/usr/bin/env node
// TEMPORARY (pre-MVP) — one-off backfill of the `inspected` frontmatter flag.
//
// Obsidian's Properties view only renders a checkbox for a boolean property
// that actually EXISTS in the file, so "absent means uninspected" would leave
// you typing the key on every card instead of ticking a box. This writes
// `inspected: false` into every card that lacks it, once.
//
// Deliberately NOT wired into predev/prebuild: it mutates authored content, and
// it must never re-stamp `false` over a card you have already ticked. Run it by
// hand (`node scripts/backfill-inspected.mjs`) if new cards need stamping.
//
// Delete this together with the `inspected` schema field (src/content.config.ts)
// and the `not-inspected` finding (src/lib/audit.ts) once the sweep is done.
//
// Idempotent: a file that already has an `inspected:` key is left untouched,
// whatever its value.

import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'src/content');

const FLAG = 'inspected: false';

/**
 * Frontmatter must be the very first thing in the file: `---` on line 1, and a
 * closing `---` on its own line. Anything else we refuse to touch rather than
 * guess — a mangled card is worse than an unstamped one.
 */
function stamp(source) {
  const lines = source.split('\n');
  if (lines[0].trim() !== '---') return { status: 'no-frontmatter' };

  const close = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (close === -1) return { status: 'unterminated' };

  const block = lines.slice(1, close);
  if (block.some(l => /^inspected\s*:/.test(l))) return { status: 'already' };

  // First inside the block, so the checkbox is the first property Obsidian
  // shows — this is a sweep tool, the flag should be the thing you land on.
  const next = [lines[0], FLAG, ...block, ...lines.slice(close)];
  return { status: 'stamped', text: next.join('\n') };
}

const files = globSync('**/index.md', { cwd: CONTENT })
  .map(f => join(CONTENT, f))
  // Underscore-prefixed dirs (_templates) are not cards — mirrors
  // CONTENT_GLOB_PATTERN in src/lib/content-glob.ts.
  .filter(f => !relative(CONTENT, f).split('/').some(seg => seg.startsWith('_')));

const tally = { stamped: 0, already: 0 };
const refused = [];

for (const file of files) {
  const result = stamp(readFileSync(file, 'utf8'));
  if (result.status === 'stamped') {
    writeFileSync(file, result.text);
    tally.stamped++;
  } else if (result.status === 'already') {
    tally.already++;
  } else {
    refused.push(`${relative(ROOT, file)} — ${result.status}`);
  }
}

console.log(`inspected backfill: ${tally.stamped} stamped, ${tally.already} already had it, ${files.length} cards total`);
if (refused.length) {
  console.log(`\n${refused.length} refused (fix the frontmatter by hand):`);
  for (const line of refused) console.log(`  ${line}`);
}
