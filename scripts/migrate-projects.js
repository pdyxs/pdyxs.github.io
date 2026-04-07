/**
 * Migrate _pastprojects/, _currentprojects/, _futureprojects/ to unified
 * projects collection.
 *
 * Transforms:
 *   - removes layout
 *   - adds status: 'past' | 'current' | 'future'
 *   - extracts definitions[] into medium and cvDescription fields
 *   - renames cvdescription → cvDescription
 *   - normalises tags
 *   - strips empty/null values
 *
 * Each project is a directory; the .md file inside becomes the collection entry.
 * Slug is the directory name (e.g. 'particulars').
 */

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

// Some source files have duplicate YAML keys (e.g. two `description:` lines).
// Keep the last occurrence of each top-level key before handing to gray-matter.
function deduplicateFrontmatter(raw) {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return raw;
  const lines = fmMatch[1].split('\n');
  const seen = new Map(); // key → last line index
  lines.forEach((line, i) => {
    const m = line.match(/^(\w[\w-]*):/);
    if (m) seen.set(m[1], i);
  });
  // Remove earlier duplicates (keep last)
  const deduped = lines.filter((line, i) => {
    const m = line.match(/^(\w[\w-]*):/);
    return !m || seen.get(m[1]) === i;
  });
  return raw.replace(fmMatch[1], deduped.join('\n'));
}

// gray-matter's yaml serializer rejects undefined values — strip them recursively
function stripUndefined(obj) {
  if (Array.isArray(obj)) return obj.map(stripUndefined).filter(v => v !== undefined);
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => [k, stripUndefined(v)])
    );
  }
  return obj;
}

const COLLECTIONS = path.resolve('../pdyxs.github.io/collections');
const DEST = path.resolve('src/content/projects');

fs.mkdirSync(DEST, { recursive: true });

const STATUS_MAP = {
  _pastprojects: 'past',
  _currentprojects: 'current',
  _futureprojects: 'future',
};

let ok = 0;

for (const [dir, status] of Object.entries(STATUS_MAP)) {
  const srcDir = path.join(COLLECTIONS, dir);
  if (!fs.existsSync(srcDir)) continue;

  for (const projectSlug of fs.readdirSync(srcDir)) {
    const projectDir = path.join(srcDir, projectSlug);
    if (!fs.statSync(projectDir).isDirectory()) continue;

    // Find the .md file (usually named <slug>.md or index.md)
    const mdFile = fs.readdirSync(projectDir).find(f => f.endsWith('.md'));
    if (!mdFile) {
      console.warn(`  no .md in ${projectDir}, skipping`);
      continue;
    }

    const raw = deduplicateFrontmatter(fs.readFileSync(path.join(projectDir, mdFile), 'utf8'));
    const { data, content } = matter(raw);

    // Drop Jekyll-only fields
    delete data.layout;

    // Add status
    data.status = status;

    // Normalise tags
    if (!data.tags) data.tags = [];
    else if (!Array.isArray(data.tags)) data.tags = [data.tags];

    // Extract definitions[] → medium (and cvDescription if present)
    if (Array.isArray(data.definitions)) {
      for (const def of data.definitions) {
        if (def.head === 'Medium' && def.text) {
          data.medium = def.text;
        }
        if (def.head === 'When' && def.text) {
          data.when = def.text; // for story-type projects
        }
      }
      delete data.definitions;
    }

    // Rename cvdescription → cvDescription
    if (data.cvdescription) {
      data.cvDescription = data.cvdescription;
      delete data.cvdescription;
    }

    // Normalise actions/quotes/images to arrays
    if (!data.actions) data.actions = [];
    if (!data.quotes) data.quotes = [];
    if (!data.images) data.images = [];

    // Strip empty quotes fields (usein etc. aren't in the new schema)
    if (Array.isArray(data.quotes)) {
      data.quotes = data.quotes.map(q => {
        const clean = { quote: q.quote, by: q.by };
        if (q.in) clean.in = { text: q.in.text, url: q.in.url };
        return clean;
      });
    }

    // Strip captions (not in new schema — images will link directly)
    delete data.captions;
    // Strip icollection (layout concern, not data)
    delete data.icollection;
    // Strip icon (layout concern)
    delete data.icon;

    const out = matter.stringify(content, stripUndefined(data));
    fs.writeFileSync(path.join(DEST, `${projectSlug}.md`), out);
    ok++;
  }
}

console.log(`projects: ${ok} migrated`);
