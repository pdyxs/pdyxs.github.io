/**
 * What the header-preview generator shoots, and what counts as missing.
 *
 * Shared by scripts/generate-header-previews.mjs and the test that fails when a
 * card is missing its still (src/lib/site/header-previews.test.ts), so the two
 * can never disagree about which cards need one.
 *
 * `needsPreview` is pure; the rest read the tree.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import matter from 'gray-matter';

export const THEMES = ['light', 'dark'];
/** Must match PREVIEW_SIZE in the capture route. */
export const SIZE = 720;

/**
 * A still is the thumbnail of last resort: `resolveThumb` reaches it only
 * after `image:` has failed to resolve. So a card needs one exactly when it
 * declares a header-media island and declares no `image:` of its own.
 */
export function needsPreview(data) {
  if (typeof data?.headerMedia !== 'string') return false;
  return !(typeof data.image === 'string' && data.image.trim() !== '');
}

/**
 * The cards that need a still but do not have one: no manifest entry, or a
 * still file missing. A stale hash is deliberately NOT a gap — that is the
 * generator's job to notice, and a red test every time a header-media component
 * changes would just train people to ignore it.
 */
export function missingPreviews(targets, manifest, hasFile) {
  return targets
    .filter(t => !manifest[t.uid] || THEMES.some(theme => !hasFile(t.uid, theme)))
    .map(t => t.uid);
}

/** Every markdown file under a content dir, mirroring CONTENT_GLOB_PATTERN. */
async function markdownFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await markdownFiles(path)));
    else if (entry.name.endsWith('.md')) found.push(path);
  }
  return found;
}

/** uid + renderer name for every card that needs a still, uid-sorted. */
export async function previewTargets(contentDir) {
  const cards = [];
  for (const file of await markdownFiles(contentDir)) {
    let data;
    try {
      ({ data } = matter(await readFile(file, 'utf8')));
    } catch {
      continue; // unparseable frontmatter: nothing to read
    }
    if (!needsPreview(data)) continue;
    // uid is the directory for an index.md card, the file stem otherwise —
    // the same `collection/id` Astro's glob loader produces.
    const rel = relative(contentDir, file);
    const uid = rel.endsWith('/index.md') ? rel.slice(0, -'/index.md'.length) : rel.slice(0, -'.md'.length);
    cards.push({ uid, name: data.headerMedia });
  }
  return cards.sort((a, b) => a.uid.localeCompare(b.uid));
}

/**
 * What a still depends on. Deliberately coarse: the whole header-media source
 * tree plus the capture route, so a change anywhere in a component re-shoots
 * every card that uses one. Over-invalidating costs a few seconds; under-
 * invalidating ships a stale picture of the thing.
 */
export async function sourceHash(mediaDir, routeFile) {
  const hash = createHash('sha256');
  const walk = async (dir) => {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (!entry.name.endsWith('.test.ts')) hash.update(await readFile(path));
    }
  };
  await walk(mediaDir);
  hash.update(await readFile(routeFile));
  hash.update(`size:${SIZE}`);
  return hash.digest('hex').slice(0, 16);
}

/** Parse the HEADER_PREVIEWS object out of the generated manifest. */
export async function readManifest(manifestFile) {
  if (!existsSync(manifestFile)) return {};
  const source = await readFile(manifestFile, 'utf8');
  // The file also declares a type, whose braces come first.
  const start = source.indexOf('HEADER_PREVIEWS');
  if (start === -1) return {};
  const open = source.indexOf('{', start);
  const close = source.lastIndexOf('}');
  if (open === -1 || close <= open) return {};
  // Keys and values are written with JSON.stringify, so the only thing
  // between here and JSON is the trailing comma on each line.
  const json = source.slice(open, close + 1).replace(/,(\s*[}\]])/g, '$1');
  try {
    return JSON.parse(json);
  } catch {
    return {}; // unreadable: treat as empty and re-shoot
  }
}
