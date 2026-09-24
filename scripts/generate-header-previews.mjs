#!/usr/bin/env node
/**
 * Generates the still image a header-media card shows where an `<img>` would
 * normally go: a browse thumbnail, and the share card.
 *
 * Why a screenshot: a header-media island has no image to point at. Its
 * surface is an SVG luminance mask over CSS dither tiles, sized from a
 * measured clientWidth — none of which exists until a browser has run the
 * component, so there is nothing to render server-side and nothing for
 * satori/resvg to rasterise. So we drive a real engine over the dev-only
 * capture route (src/pages/preview/[theme]/[...path].astro) and screenshot it.
 *
 * Two images per card, light and dark, because the site's theme is a straight
 * ink/paper inversion and a still of the light one reads as a hole in a dark
 * page. Which one is shown is decided in CSS, by the same `data-theme`
 * attribute everything else keys off.
 *
 * Incremental, like generate-vimeo-posters: each card's entry carries a hash
 * of everything that can change what the still looks like (the renderer name
 * and the source of every header-media component). Unchanged cards are
 * skipped, so the usual run launches no browser at all. `--force` re-shoots
 * everything; `--card <uid>` limits it to one.
 *
 * The PNGs are committed. The build never runs this — it is a local,
 * on-demand step, so CI needs no browser (and no Actions minutes).
 *
 * Run via `npm run generate:header-previews`.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONTENT_DIR = join(ROOT, 'src/content');
const MEDIA_DIR = join(ROOT, 'src/components/header-media');
const ROUTE = join(ROOT, 'src/pages/preview/[theme]/[...path].astro');
const OUT_DIR = join(ROOT, 'public/previews');
const MANIFEST = join(ROOT, 'src/data/header-previews.generated.ts');

const THEMES = ['light', 'dark'];
/** Must match PREVIEW_SIZE in the capture route. */
const SIZE = 720;
const PORT = 43_217;

const args = process.argv.slice(2);
const force = args.includes('--force');
const cardFlag = args.indexOf('--card');
const onlyCard = cardFlag === -1 ? null : args[cardFlag + 1] ?? null;

/** Every markdown file under src/content, mirroring CONTENT_GLOB_PATTERN. */
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

/** uid + renderer name for every card that declares `headerMedia`. */
async function cardsWithHeaderMedia() {
  const cards = [];
  for (const file of await markdownFiles(CONTENT_DIR)) {
    let data;
    try {
      ({ data } = matter(await readFile(file, 'utf8')));
    } catch {
      continue; // unparseable frontmatter: no headerMedia to read
    }
    if (typeof data?.headerMedia !== 'string') continue;
    // uid is the directory for an index.md card, the file stem otherwise —
    // the same `collection/id` Astro's glob loader produces.
    const rel = relative(CONTENT_DIR, file);
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
async function sourceHash() {
  const hash = createHash('sha256');
  const walk = async (dir) => {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (!entry.name.endsWith('.test.ts')) hash.update(await readFile(path));
    }
  };
  await walk(MEDIA_DIR);
  hash.update(await readFile(ROUTE));
  hash.update(`size:${SIZE}`);
  return hash.digest('hex').slice(0, 16);
}

async function readManifest() {
  if (!existsSync(MANIFEST)) return {};
  const source = await readFile(MANIFEST, 'utf8');
  // Parse the HEADER_PREVIEWS object only — the file also declares a type,
  // whose braces come first.
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

async function writeManifest(entries) {
  const body = Object.entries(entries)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([uid, e]) => `  ${JSON.stringify(uid)}: ${JSON.stringify(e)},`)
    .join('\n');
  await writeFile(
    MANIFEST,
    `// GENERATED by scripts/generate-header-previews.mjs — do not edit.\n` +
      `// One entry per card with a \`headerMedia:\` island, mapping to the stills\n` +
      `// screenshotted from it. \`hash\` is what decides a re-shoot; the paths are\n` +
      `// public/ URLs, ready for <img src>.\n\n` +
      `export type HeaderPreview = { light: string; dark: string; hash: string };\n\n` +
      `export const HEADER_PREVIEWS: Record<string, HeaderPreview> = {\n${body}\n};\n`,
    'utf8',
  );
}

/** Start a dev server of our own, so the run doesn't depend on one running. */
async function startDevServer() {
  // `npx astro dev`, not `npm run dev`: the latter fires every predev
  // generator, including slow network ones, for a screenshot run.
  const proc = spawn('npx', ['astro', 'dev', '--port', String(PORT)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const url = `http://localhost:${PORT}`;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) throw new Error(`astro dev exited (${proc.exitCode}) before it was ready`);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return { proc, url };
    } catch {
      // not up yet
    }
    await new Promise(r => setTimeout(r, 500));
  }
  proc.kill('SIGTERM');
  throw new Error('astro dev did not become ready within 90s');
}

const cards = (await cardsWithHeaderMedia()).filter(c => !onlyCard || c.uid === onlyCard);
const hash = await sourceHash();
const manifest = await readManifest();

// Drop entries for cards that no longer declare header media, and their files.
const live = new Set(cards.map(c => c.uid));
for (const uid of Object.keys(manifest)) {
  if (!live.has(uid) && !onlyCard) {
    delete manifest[uid];
    await rm(join(OUT_DIR, uid), { recursive: true, force: true });
  }
}

const stale = cards.filter(c => force || manifest[c.uid]?.hash !== hash
  || THEMES.some(t => !existsSync(join(OUT_DIR, c.uid, `${t}.png`))));

if (stale.length === 0) {
  await writeManifest(manifest);
  console.log(`header-previews: ${cards.length} card(s) up to date`);
  process.exit(0);
}

console.log(`header-previews: shooting ${stale.length} of ${cards.length} card(s)`);

const { chromium } = await import('playwright-core').catch(() => {
  throw new Error('playwright-core is not installed — run `npm install`');
});

/**
 * playwright-core ships no browser. Rather than pin this repo to one
 * playwright version's exact Chromium revision, use whatever is already in
 * the shared cache (~/.cache/ms-playwright), newest first — a headless shell
 * for preference, since that is all a screenshot needs.
 */
async function findChromium() {
  const cache = join(process.env.HOME ?? '', '.cache/ms-playwright');
  if (!existsSync(cache)) return null;
  const candidates = [];
  for (const dir of await readdir(cache)) {
    const revision = Number(dir.split('-').pop());
    if (!Number.isFinite(revision)) continue;
    const paths = dir.startsWith('chromium_headless_shell-')
      ? [join(cache, dir, 'chrome-headless-shell-linux64/chrome-headless-shell')]
      : dir.startsWith('chromium-')
        ? [join(cache, dir, 'chrome-linux64/chrome'), join(cache, dir, 'chrome-linux/chrome')]
        : [];
    for (const path of paths) {
      // A headless shell outranks a full browser at the same revision.
      if (existsSync(path)) candidates.push({ path, revision, shell: path.includes('headless-shell') });
    }
  }
  candidates.sort((a, b) => b.revision - a.revision || Number(b.shell) - Number(a.shell));
  return candidates[0]?.path ?? null;
}

const executablePath = await findChromium();
if (!executablePath) {
  throw new Error(
    'No Chromium found in ~/.cache/ms-playwright. Install one with ' +
      '`npx playwright-core install chromium-headless-shell`.',
  );
}

const server = await startDevServer();
let browser;
try {
  browser = await chromium.launch({ executablePath });
  const page = await browser.newPage({
    viewport: { width: SIZE + 40, height: SIZE + 40 },
    // Capture the state the component settles into, not a mid-animation frame:
    // a first version is a still, and reduced motion is how a component is
    // asked to skip straight to it.
    reducedMotion: 'reduce',
  });

  for (const card of stale) {
    for (const theme of THEMES) {
      const url = `${server.url}/preview/${theme}/${card.uid}`;
      const response = await page.goto(url, { waitUntil: 'load' });
      if (!response?.ok()) throw new Error(`${url} returned ${response?.status()}`);
      await page.waitForSelector('html[data-preview-ready]', { timeout: 15_000 });
      const element = await page.$('#preview');
      if (!element) throw new Error(`${url} rendered no #preview element`);
      const file = join(OUT_DIR, card.uid, `${theme}.png`);
      await mkdir(dirname(file), { recursive: true });
      await element.screenshot({ path: file });
    }
    manifest[card.uid] = {
      light: `/previews/${card.uid}/light.png`,
      dark: `/previews/${card.uid}/dark.png`,
      hash,
    };
    console.log(`  ${card.uid} (${card.name})`);
  }
} finally {
  await browser?.close();
  server.proc.kill('SIGTERM');
}

await writeManifest(manifest);
console.log(`header-previews: ${stale.length} card(s) -> public/previews, ${MANIFEST.replace(ROOT, '')}`);
