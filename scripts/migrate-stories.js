/**
 * Migrate _arctic/, _galapagos/, _fatecardgame/ to stories collection.
 *
 * Each source entry is a directory named with a numeric prefix (e.g. '0-0-introduction').
 * The prefix encodes the chapter order; the remainder is the slug.
 *
 * Transforms:
 *   - adds series (collection name) and order (numeric, from prefix)
 *   - renames photo-date → date if date is absent
 *   - removes layout
 *
 * Output filenames: <series>/<order>-<slug>.md
 */

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const COLLECTIONS = path.resolve('../pdyxs.github.io/collections');
const DEST = path.resolve('src/content/stories');

const SERIES = {
  _arctic: 'arctic',
  _galapagos: 'galapagos',
  _fatecardgame: 'fatecardgame',
};

let ok = 0;

for (const [dir, series] of Object.entries(SERIES)) {
  const srcDir = path.join(COLLECTIONS, dir);
  if (!fs.existsSync(srcDir)) continue;

  const seriesDest = path.join(DEST, series);
  fs.mkdirSync(seriesDest, { recursive: true });

  const entries = fs.readdirSync(srcDir).sort();

  for (const entryName of entries) {
    const entryPath = path.join(srcDir, entryName);
    if (!fs.statSync(entryPath).isDirectory()) continue;

    // Parse order from leading numeric prefix: '0-0-introduction' → order=0, slug='introduction'
    // '1-3-flowers' → order=3 within chapter 1, but we want a flat sequence number
    // Use position in sorted array as the authoritative order.
    const order = entries.filter(e => fs.statSync(path.join(srcDir, e)).isDirectory())
                         .sort()
                         .indexOf(entryName);

    // Find the .md file (index.md or <name>.md)
    const mdFile = fs.readdirSync(entryPath).find(f => f.endsWith('.md'));
    if (!mdFile) {
      console.warn(`  no .md in ${entryPath}, skipping`);
      continue;
    }

    const raw = fs.readFileSync(path.join(entryPath, mdFile), 'utf8');
    const { data, content } = matter(raw);

    delete data.layout;

    data.series = series;
    data.order = order;

    // Prefer date over photo-date; fall back to photo-date
    if (!data.date && data['photo-date']) {
      data.date = data['photo-date'];
    }
    delete data['photo-date'];

    // Derive slug from entry directory name (strip leading numeric prefix)
    const slug = entryName.replace(/^\d+-\d+-/, '').replace(/^\d+-/, '');

    const out = matter.stringify(content, data);
    fs.writeFileSync(path.join(seriesDest, `${String(order).padStart(2, '0')}-${slug}.md`), out);
    ok++;
  }
}

console.log(`stories: ${ok} migrated`);
