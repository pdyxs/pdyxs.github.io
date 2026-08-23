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
import matter from 'gray-matter';
import { assignCodes, withTitles } from '../src/lib/stack-manifest.ts';
import { uidFromContentPath, uidFromTagPath } from '../src/lib/content-uid.ts';
import { normaliseAuthoredTag } from '../src/lib/five-w.ts';
import { isGeneratorEntry } from '../src/lib/exclude-tags.ts';
import { isVaultInfrastructurePath } from '../src/lib/content-glob.ts';
import { derivePathTags } from '../src/lib/tag-inheritance.ts';
import { allLensUids, getLensDefinition, lensIdFromUid } from '../src/lib/lens-registry.ts';
import { allGeneratedFilterValues } from '../src/lib/filter-generators.ts';
import { resolveFolderCascade, makeFileReader } from '../src/lib/folder-config.ts';
import { computeStatusVisibility, resolveStatus } from '../src/lib/status-visibility.ts';
import { resolveCardTitle } from '../src/lib/card-title.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(__dirname, '../src/content');
const TAG_DIR = path.join(CONTENT_DIR, 'tag');
const MANIFEST_PATH = path.resolve(__dirname, '../src/data/stack-manifest.json');
const TAG_MANIFEST_PATH = path.resolve(__dirname, '../src/data/tag-manifest.json');

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


async function collectUids() {
  const allFiles = await walk(CONTENT_DIR);
  const uids = [];

  for (const file of allFiles) {
    const relToContent = path.relative(CONTENT_DIR, file).split(path.sep).join('/');
    if (isVaultInfrastructurePath(relToContent)) continue;

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
  //
  // Lens uids come from the lens registry (src/lib/lens-registry.ts), not the
  // filesystem — enumeration is driven from the registry so a new lens gets a
  // manifest code the moment it's declared, with no route file required.
  //
  // Deliberately not status-filtered (unlike collectTags below, see issue
  // #50): a short code identifies a uid's *URL*, not its listing visibility.
  // `unlisted` cards must stay reachable at their URL, and codes are
  // append-only/never reassigned (src/lib/stack-manifest.ts) — excluding a
  // draft card's uid here would only save one throwaway code, at the cost of
  // reassigning it a different code later if that draft is ever published.
  return [...new Set([...uids, ...allLensUids()])].sort();
}

// Every dimensioned prefix of a `dim:value` tag — filters can select any
// ancestor level, so all of them need a code. `what:games/analog` yields
// `what:games` and `what:games/analog`. A bare dimension root (empty value)
// isn't a valid filter and is skipped.
function dimensionedPrefixes(tag) {
  const colon = tag.indexOf(':');
  if (colon === -1) return [tag]; // dimensionless — used as-is
  const dim = tag.slice(0, colon);
  const rest = tag.slice(colon + 1);
  if (!rest) return [];
  const segs = rest.split('/');
  const out = [];
  let acc = '';
  for (const seg of segs) {
    acc = acc ? `${acc}/${seg}` : seg;
    out.push(`${dim}:${acc}`);
  }
  return out;
}

// Enumerates the filter tags the codec should keep short: each card's
// folder-derived tag (and its ancestor prefixes, since a filter can select any
// level), plus any dimensioned (`dim:value`) tags declared in frontmatter, plus
// any dimensionless (bare-slug) frontmatter tags — the `filter=<slug>` feature
// (see param-codecs.ts's filterCodec) codes them exactly. Dimensionless slugs
// are flat, so they need no ancestor-prefix expansion. Uncovered values still
// work via the codec's raw fallback.
//
// Status-aware (issue #50): a card whose resolved status isn't `.listed` (see
// computeStatusVisibility) contributes no tag values here — the same rule the
// tag registry (src/lib/tag-registry.ts, via getAllCards()'s `.visibility`)
// already applies to the runtime browse/lens pool. This script walks the
// filesystem directly instead of going through getAllCards(), so it resolves
// status itself via resolveStatus (frontmatter, falling back to the
// _config.yaml cascade). It always evaluates with `isDev: false`: this script
// has no notion of dev vs. build (it's the same "pre*" step for both), and
// the runtime dev bypass is handled independently by getAllCards() at request
// time — a hidden card's tags simply falling back to raw (uncoded) URL
// encoding here is a cosmetic cost, not a correctness one.
async function collectTags() {
  const allFiles = await walk(CONTENT_DIR);
  const tags = new Set();
  const reader = makeFileReader();
  const now = new Date();

  for (const file of allFiles) {
    const relToContent = path.relative(CONTENT_DIR, file).split(path.sep).join('/');
    if (isVaultInfrastructurePath(relToContent)) continue;
    if (relToContent.startsWith('tag/')) continue;
    if (!/\.(md|mdx)$/i.test(relToContent)) continue;

    const uid = uidFromContentPath(relToContent);

    let data = {};
    try {
      ({ data } = matter(await readFile(file, 'utf-8')));
    } catch {
      // Unparseable frontmatter — no status/date/tags to read; the path-
      // derived tag is skipped too below (status resolves to the cascade
      // default), same as any other card with no readable frontmatter.
    }

    const cascade = await resolveFolderCascade(uid, reader);
    const status = resolveStatus(data?.status, cascade.status);
    const visibility = computeStatusVisibility(status, data?.date, { isDev: false, now });
    if (!visibility.listed) continue;

    for (const tag of derivePathTags(uid)) {
      for (const prefix of dimensionedPrefixes(tag)) tags.add(prefix);
    }

    if (Array.isArray(data?.tags)) {
      for (const rawAuthored of data.tags) {
        if (typeof rawAuthored !== 'string' || !rawAuthored) continue;
        // `generated/<name>` is a directive re-enabling a derivation, not a
        // filter value (see exclude-tags.ts). resolveCard strips it; this
        // script reads frontmatter directly, so it must skip it itself or the
        // manifest assigns a short code to a tag that can never exist.
        if (isGeneratorEntry(rawAuthored)) continue;
        // gray-matter hands us the *authored* form (`where/work/seethrough`) —
        // this script reads frontmatter directly rather than through the
        // content collection, so it doesn't get content.config.ts's transform.
        const raw = normaliseAuthoredTag(rawAuthored);
        if (raw.includes(':')) {
          for (const prefix of dimensionedPrefixes(raw)) tags.add(prefix);
        } else {
          tags.add(raw); // dimensionless — flat, no prefix expansion
        }
      }
    }
  }

  // `<name>.tag.yaml`-declared values. Most of these also appear as an authored
  // tag above, but an *affiliation* (a declaration with `seeds:` — see
  // affiliations.ts) never does: no card writes `who:seethrough` in its
  // frontmatter, membership is derived from the pool at request time. Without
  // this they'd fall back to raw URL encoding.
  for (const file of allFiles) {
    const relToContent = path.relative(CONTENT_DIR, file).split(path.sep).join('/');
    if (isVaultInfrastructurePath(relToContent)) continue;
    if (relToContent.startsWith('tag/')) continue;
    if (!relToContent.endsWith('.tag.yaml')) continue;
    const declPath = relToContent.slice(0, -'.tag.yaml'.length);
    const slashIdx = declPath.indexOf('/');
    if (slashIdx === -1) continue;
    const value = `${declPath.slice(0, slashIdx)}:${declPath.slice(slashIdx + 1)}`;
    for (const prefix of dimensionedPrefixes(value)) tags.add(prefix);
  }

  // Filter values injected at runtime by generators (src/lib/filter-generators.ts)
  // — e.g. the travel-log `where:*` tags. These never appear in the filesystem
  // walked above, so enumerate them here (with ancestor prefixes) or they'd
  // fall back to raw URL encoding.
  for (const value of allGeneratedFilterValues()) {
    for (const prefix of dimensionedPrefixes(value)) tags.add(prefix);
  }

  return [...tags].sort();
}

/**
 * uid -> display title, for the cold-load stack skeleton (issue #101).
 *
 * Read from the same two sources the runtime reads: `resolveCardTitle` for a
 * card's frontmatter (the one place that decision lives — a card with no
 * `title` resolves to '' and is simply omitted here), and the lens registry's
 * `label` for a lens. Deliberately NOT re-derived from the slug: the skeleton
 * has to say what the card will say when it lands, or the title visibly
 * changes as fragments arrive, which is the shift this exists to remove.
 *
 * Unlike `collectTags`, this is not status-filtered — for the same reason
 * `collectUids` isn't. A title identifies a URL, not a listing, and an
 * `unlisted` card reached by a shared deep link still needs its breadcrumb.
 */
async function collectTitles() {
  const allFiles = await walk(CONTENT_DIR);
  const titles = new Map();

  for (const file of allFiles) {
    const relToContent = path.relative(CONTENT_DIR, file).split(path.sep).join('/');
    if (isVaultInfrastructurePath(relToContent)) continue;
    if (relToContent.startsWith('tag/')) continue;
    if (!/\.(md|mdx)$/i.test(relToContent)) continue;

    let data = {};
    try {
      ({ data } = matter(await readFile(file, 'utf-8')));
    } catch {
      continue; // unparseable frontmatter — no title to read
    }
    const title = resolveCardTitle(data);
    if (title) titles.set(uidFromContentPath(relToContent), title);
  }

  for (const uid of allLensUids()) {
    const id = lensIdFromUid(uid);
    const label = id ? getLensDefinition(id)?.label : undefined;
    if (label) titles.set(uid, label);
  }

  return titles;
}

async function loadExistingManifest(manifestPath) {
  try {
    const text = await readFile(manifestPath, 'utf-8');
    return JSON.parse(text);
  } catch {
    return [];
  }
}

async function writeManifest(label, manifestPath, uids, titles) {
  const existing = await loadExistingManifest(manifestPath);
  let manifest = assignCodes(existing, uids);
  // Codes are append-only; titles are refreshed wholesale every run. The two
  // rules live in separate functions so neither can be applied to the other.
  if (titles) manifest = withTitles(manifest, titles);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  const titled = manifest.filter(e => e.title).length;
  console.log(
    `${label}: ${manifest.length} entries (${manifest.length - existing.length} new)` +
    (titles ? `, ${titled} titled` : ''),
  );
}

async function main() {
  // Only the stack manifest carries titles: it is the one the cold-load
  // skeleton reads, and the tag manifest's values are filters, not locations.
  await writeManifest('stack-manifest', MANIFEST_PATH, await collectUids(), await collectTitles());
  await writeManifest('tag-manifest', TAG_MANIFEST_PATH, await collectTags());
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
