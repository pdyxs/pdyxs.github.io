/**
 * Build step: regenerates the old-URL redirect map at
 * src/data/redirects.generated.ts (issue #70).
 *
 * The pre-Astro site was a Jekyll build living on the `master` branch. Its
 * permalinks are declared in master's `_config.yml` and its content in master's
 * `collections/` tree, so this script reads both straight out of git — nothing
 * is transcribed by hand, which is what keeps the map complete and re-runnable
 * as content moves around in `src/content`.
 *
 * All the decisions live in src/lib/redirect-map.ts (pure, unit-tested). This
 * script is the thin applier: git → uid walk → buildRedirectMap → write file
 * and print the report.
 *
 * Run automatically before `npm run build` (and `npm run dev`) via the "pre*"
 * npm lifecycle scripts in package.json. Safe to run manually:
 *   node scripts/generate-redirects.mjs
 *
 * If master isn't available (a shallow clone, say), the script leaves the
 * existing generated file alone and exits 0 rather than wiping the map.
 */

import { execFileSync } from 'node:child_process';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { load as parseYaml } from 'js-yaml';
import { uidFromContentPath } from '../src/lib/content-uid.ts';
import { isVaultInfrastructurePath } from '../src/lib/content-glob.ts';
import { resolveFolderCascade, makeFileReader } from '../src/lib/folder-config.ts';
import { computeStatusVisibility, resolveStatus } from '../src/lib/status-visibility.ts';
import {
  enumerateOldUrls,
  buildRedirectMap,
  STATIC_PAGE_REDIRECTS,
} from '../src/lib/redirect-map.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(REPO_ROOT, 'src/content');
const OUT_PATH = path.join(REPO_ROOT, 'src/data/redirects.generated.ts');

/** Branch holding the retired Jekyll site. */
const LEGACY_REF = 'master';

// ---------------------------------------------------------------------------
// git
// ---------------------------------------------------------------------------

function git(...args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf-8', maxBuffer: 128 * 1024 * 1024 });
}

// ---------------------------------------------------------------------------
// Jekyll config → permalink rules
// ---------------------------------------------------------------------------

/**
 * Derives the per-collection permalink rules from master's `_config.yml`.
 *
 * Only `output: true` collections ever had URLs. A collection with no
 * `permalink` default gets Jekyll's built-in collection permalink,
 * `/:collection/:path` (Jekyll appends `:output_ext`, but a `foo/index.md`
 * document is served from `foo/index.html`, i.e. at `/…/foo/`, which is what a
 * directory-style redirect target produces anyway).
 *
 * Strategy is derived, not transcribed: a collection whose name matches a story
 * folder in the new tree resolves per-item within that story; the `/where/:title`
 * collection (`_places`) held the landing pages *for* those stories, so it
 * resolves to a story's first item; everything else is a plain slug match.
 */
function permalinkRules(config, storyNames) {
  const collections = config?.collections ?? {};
  const permalinkByType = new Map();
  for (const entry of config?.defaults ?? []) {
    const type = entry?.scope?.type;
    const permalink = entry?.values?.permalink;
    if (type && permalink) permalinkByType.set(type, permalink);
  }

  // `posts` is Jekyll's built-in collection: it is always output, and never
  // appears under `collections:` in the config, so it's added explicitly.
  const published = new Set(['posts']);
  for (const [collection, settings] of Object.entries(collections)) {
    if (settings?.output) published.add(collection);
  }

  const rules = [];
  for (const collection of published) {
    const permalink = permalinkByType.get(collection) ?? '/:collection/:path';
    const strategy = storyNames.has(collection)
      ? 'story-item'
      : permalink === '/where/:title'
        ? 'story-index'
        : 'slug';
    rules.push({
      collection,
      permalink,
      strategy,
      // Only `_posts` uses Jekyll's dated-filename convention, where the
      // `YYYY-MM-DD-` prefix is stripped out of `:title`.
      datedFilenames: collection === 'posts',
    });
  }
  return rules;
}

// ---------------------------------------------------------------------------
// Current content tree → reachable uids
// ---------------------------------------------------------------------------

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
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}


/**
 * Enumerates the uids in the content tree, split by whether they actually have
 * a `/card/<uid>` page in a production build. `reachable` mirrors the filter in
 * src/pages/card/[...path].astro (`visibility.reachable`, evaluated with
 * isDev: false) so a redirect can never be aimed at a URL that 404s — an old
 * URL whose card is unreachable falls back to a lens instead, and shows up in
 * the report.
 *
 * `all` includes the unreachable ones, and exists purely so buildRedirectMap
 * can attribute those fallbacks to the card whose status caused them.
 */
async function collectUids() {
  const files = await walk(CONTENT_DIR);
  const reader = makeFileReader();
  const now = new Date();
  const uids = [];
  const all = [];

  for (const file of files) {
    const rel = path.relative(CONTENT_DIR, file).split(path.sep).join('/');
    if (isVaultInfrastructurePath(rel)) continue;
    if (rel.startsWith('tag/')) continue;
    if (!/\.(md|mdx)$/i.test(rel)) continue;

    const uid = uidFromContentPath(rel);
    let data = {};
    try {
      ({ data } = matter(await readFile(file, 'utf-8')));
    } catch {
      // Unparseable frontmatter — fall through to the folder-cascade default.
    }
    const cascade = await resolveFolderCascade(uid, reader);
    const status = resolveStatus(data?.status, cascade.status);
    const visibility = computeStatusVisibility(status, data?.date, { isDev: false, now });
    all.push(uid);
    if (!visibility.reachable) continue;
    uids.push(uid);
  }

  const dedupe = list => [...new Set(list)].sort();
  return { reachable: dedupe(uids), all: dedupe(all) };
}

/** Story folder names in the new tree, e.g. `arctic` from `what/posts/stories/arctic/…`. */
function storyNamesFrom(uids) {
  const names = new Set();
  for (const uid of uids) {
    const match = /(?:^|\/)stories\/([^/]+)\//.exec(uid);
    if (match) names.add(match[1]);
  }
  return names;
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

function renderModule(report) {
  const lines = [
    '// AUTO-GENERATED by scripts/generate-redirects.mjs — do not edit by hand.',
    `// Source: the retired Jekyll site on the \`${LEGACY_REF}\` branch (_config.yml + collections/),`,
    '// resolved against src/content by src/lib/redirect-map.ts. Regenerated on predev/prebuild.',
    '//',
    `// ${report.stats.total} old URLs: ${report.stats.resolved} resolved to a card, ` +
      `${report.stats.unresolved} fell back to a lens.`,
    ...Object.entries(report.stats.byLabel)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([label, s]) => `//   ${label}: ${s.resolved}/${s.total} resolved`),
    '',
    '/**',
    ' * Old Jekyll URL → new URL. Consumed by `redirects` in astro.config.mjs, which',
    ' * emits one meta-refresh HTML page per entry in the static build (GitHub Pages',
    ' * has no server-side redirect capability).',
    ' */',
    'export const REDIRECTS: Record<string, string> = {',
    ...Object.entries(report.redirects).map(([from, to]) => `  ${JSON.stringify(from)}: ${JSON.stringify(to)},`),
    '};',
    '',
    '/**',
    ' * The audit trail: old URLs that could not be resolved to a card and were sent',
    ' * to a lens instead. Never silently dropped — every entry here still has a',
    ' * REDIRECTS row, and the list is asserted against in src/lib/redirect-map.test.ts.',
    ' */',
    'export const UNRESOLVED_OLD_URLS: readonly { from: string; to: string; reason: string }[] = [',
    ...report.unresolved.map(
      u => `  { from: ${JSON.stringify(u.from)}, to: ${JSON.stringify(u.to)}, reason: ${JSON.stringify(u.reason ?? '')} },`,
    ),
    '];',
    '',
    '/**',
    ' * The subset of UNRESOLVED_OLD_URLS traceable to a card that still exists but',
    ' * is unreachable in a production build (`status: draft`/`archived`, or a',
    ' * `scheduled` date not yet reached). Consumed by the audit lens, which lists',
    ' * the offending cards by name — publishing one closes its entry here.',
    ' */',
    'export const ORPHANED_OLD_URLS: readonly { uid: string; from: string; to: string }[] = [',
    ...report.orphaned.map(
      o => `  { uid: ${JSON.stringify(o.uid)}, from: ${JSON.stringify(o.from)}, to: ${JSON.stringify(o.to)} },`,
    ),
    '];',
    '',
  ];
  return lines.join('\n');
}

function printReport(report) {
  console.log(
    `redirects: ${report.stats.total} old URLs → ${report.stats.resolved} resolved, ${report.stats.unresolved} unresolved`,
  );
  for (const [label, s] of Object.entries(report.stats.byLabel).sort(([a], [b]) => (a < b ? -1 : 1))) {
    console.log(`  ${label.padEnd(16)} ${s.resolved}/${s.total}`);
  }
  if (report.unresolved.length > 0) {
    console.log('  unresolved (redirected to a lens, not dropped):');
    for (const u of report.unresolved) console.log(`    ${u.from} → ${u.to}  (${u.reason})`);
  }
  if (report.orphaned.length > 0) {
    console.log('  orphaned by an unreachable card (publish it to restore the URL):');
    for (const o of report.orphaned) console.log(`    ${o.uid.padEnd(40)} ${o.from}`);
  }
}

// ---------------------------------------------------------------------------

async function main() {
  let configYaml;
  let treeListing;
  try {
    configYaml = git('show', `${LEGACY_REF}:_config.yml`);
    treeListing = git('ls-tree', '-r', '--name-only', LEGACY_REF, 'collections/');
  } catch (err) {
    console.warn(
      `redirects: could not read the \`${LEGACY_REF}\` branch (${err.message.trim().split('\n')[0]}) — ` +
        'keeping the existing src/data/redirects.generated.ts.',
    );
    return;
  }

  const { reachable: uids, all: allUids } = await collectUids();
  // Story names come from the full tree: a story whose every chapter is still
  // drafted must keep its permalink rule, or its old URLs stop being enumerated
  // at all and silently vanish from the report instead of falling back.
  const storyNames = storyNamesFrom(allUids);
  const rules = permalinkRules(parseYaml(configYaml), storyNames);
  const paths = treeListing.split('\n').filter(Boolean);

  const oldUrls = [...enumerateOldUrls(paths, rules), ...STATIC_PAGE_REDIRECTS];
  const report = buildRedirectMap(oldUrls, uids, allUids);

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, renderModule(report), 'utf-8');
  printReport(report);
}

await main();
