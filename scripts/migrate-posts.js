/**
 * Migrate _posts/ from Jekyll to Astro content collection.
 *
 * Transforms:
 *   - removes layout, categories
 *   - normalises tags to array (never undefined)
 *   - strips empty description
 *   - keeps date, title, image, canonical_url, source, project as-is
 *
 * URL compatibility: filename format YYYY-MM-DD-slug.md is preserved so
 * getStaticPaths() can reconstruct /YYYY/MM/DD/slug/ exactly.
 */

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const SRC = path.resolve('../pdyxs.github.io/collections/_posts');
const DEST = path.resolve('src/content/posts');

fs.mkdirSync(DEST, { recursive: true });

const files = fs.readdirSync(SRC).filter(f => f.endsWith('.md'));
let ok = 0, skipped = 0;

for (const filename of files) {
  const raw = fs.readFileSync(path.join(SRC, filename), 'utf8');
  const { data, content } = matter(raw);

  // Drop Jekyll-only fields
  delete data.layout;
  delete data.categories;

  // Normalise tags: always an array, never null/undefined
  if (!data.tags) data.tags = [];
  else if (!Array.isArray(data.tags)) data.tags = [data.tags];

  // Strip empty description (Jekyll templates emit `description:` with no value)
  if (data.description === null || data.description === '') {
    delete data.description;
  }

  // Ensure date is present (derive from filename if somehow missing)
  if (!data.date) {
    const match = filename.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) data.date = new Date(match[1]);
  }

  const out = matter.stringify(content, data);
  fs.writeFileSync(path.join(DEST, filename), out);
  ok++;
}

console.log(`posts: ${ok} migrated, ${skipped} skipped`);
