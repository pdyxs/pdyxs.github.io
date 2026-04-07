/**
 * Migrate _workhistory/ to work collection.
 *
 * Each entry is a .md file (occasionally a directory with a .md inside).
 *
 * Transforms:
 *   - removes layout
 *   - extracts definitions[] → when and roles fields
 *   - strips usein metadata (CV filtering will be handled in the layout)
 */

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const SRC = path.resolve('../pdyxs.github.io/collections/_workhistory');
const DEST = path.resolve('src/content/work');

fs.mkdirSync(DEST, { recursive: true });

let ok = 0;

for (const entry of fs.readdirSync(SRC)) {
  const entryPath = path.join(SRC, entry);
  const stat = fs.statSync(entryPath);

  let mdPath, slug;
  if (stat.isDirectory()) {
    const mdFile = fs.readdirSync(entryPath).find(f => f.endsWith('.md'));
    if (!mdFile) { console.warn(`  no .md in ${entryPath}, skipping`); continue; }
    mdPath = path.join(entryPath, mdFile);
    slug = entry;
  } else if (entry.endsWith('.md')) {
    mdPath = entryPath;
    slug = entry.replace(/\.md$/, '');
  } else {
    continue;
  }

  const raw = fs.readFileSync(mdPath, 'utf8');
  const { data, content } = matter(raw);

  delete data.layout;

  // Extract definitions[] → when and roles
  if (Array.isArray(data.definitions)) {
    for (const def of data.definitions) {
      if (def.head === 'When') data.when = def.text;
      if (def.head === 'Roles') data.roles = def.text;
    }
    delete data.definitions;
  }

  const out = matter.stringify(content, data);
  fs.writeFileSync(path.join(DEST, `${slug}.md`), out);
  ok++;
}

console.log(`work: ${ok} migrated`);
