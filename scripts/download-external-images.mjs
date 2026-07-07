/**
 * One-off (re-runnable) migration: download externally-hosted post images and
 * localise them.
 *
 * For every src/content/**\/*.md it collects external image URLs from:
 *   - frontmatter `image:` (header)
 *   - frontmatter `images[]` entries that are real image URLs (video embeds,
 *     which lack an image extension, are skipped — matching resolveGalleryImages)
 *   - the markdown body (`![alt](url)`, incl. the inner image of `[![](url)](link)`)
 *
 * Each URL is first normalised to its full-size original where the host encodes
 * a resize (WordPress Photon `i*.wp.com`, Medium `/max/<n>/`, kinja) and fetched;
 * on failure it falls back to the original URL. Bytes are written colocated next
 * to the post's index.md with a filename sanitised from the URL (or img-N when
 * there's no usable name). References are then rewritten on the raw file text —
 * frontmatter `image:`/`images[]` to a bare filename, body images to `./file`
 * (the `./` makes Astro run them through astro:assets).
 *
 * Idempotent: references already local (not http) are skipped, so a re-run only
 * retries whatever failed last time. Failed downloads are left untouched and
 * listed in the summary.
 *
 *   node scripts/download-external-images.mjs
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(__dirname, '../src/content');

// Same extension set the resolver in src/lib/images.ts claims to support.
const IMAGE_URL_PATTERN = /\.(jpe?g|png|gif|webp|avif)$/i;

const CONTENT_TYPE_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

const FETCH_TIMEOUT_MS = 30000;
const REQUEST_DELAY_MS = 250; // politeness delay between downloads
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Filesystem walk ──────────────────────────────────────────────────────────

async function walkMarkdown(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_')) continue; // matches the content glob
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkMarkdown(full)));
    else if (entry.isFile() && /\.(md|mdx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

// ─── URL normalisation (full-size original) ───────────────────────────────────

/** Map a resized/proxied URL to its full-size original, or null if no rule applies. */
function fullSizeVariant(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname;

  // WordPress Photon proxy — dropping the query yields the full-size original.
  if (/(^|\.)i\d\.wp\.com$/.test(host)) {
    if (url.search) {
      url.search = '';
      return url.toString();
    }
    return null;
  }

  // Medium — the /max/<n>/ (or /fit/c/<w>x<h>/) segment caps width; request a
  // large max and Medium returns the original without upscaling past it.
  if (host === 'cdn-images-1.medium.com' || host === 'miro.medium.com') {
    const bumped = url.pathname
      .replace(/\/max\/\d+\//, '/max/4000/')
      .replace(/\/fit\/c\/\d+x\d+\//, '/max/4000/');
    if (bumped !== url.pathname) {
      url.pathname = bumped;
      return url.toString();
    }
    return null;
  }

  // Kinja — resize lives in the query string.
  if (host === 'i.kinja-img.com') {
    if (url.search) {
      url.search = '';
      return url.toString();
    }
    return null;
  }

  return null;
}

// ─── Download ─────────────────────────────────────────────────────────────────

const MAX_429_RETRIES = 4;

async function fetchImage(url, retriesOn429 = MAX_429_RETRIES) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
    });
    if (res.status === 429 && retriesOn429 > 0) {
      clearTimeout(timer);
      await sleep(8000 * 2 ** (MAX_429_RETRIES - retriesOn429)); // 8s, 16s, 32s, 64s
      return fetchImage(url, retriesOn429 - 1);
    }
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return { ok: false, reason: 'empty body' };
    if (!type.startsWith('image/')) return { ok: false, reason: `content-type ${type || 'unknown'}` };
    return { ok: true, buf, contentType: type };
  } catch (err) {
    return { ok: false, reason: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Wayback Machine fallback (for dead hosts) ────────────────────────────────

/** Strip a Photon (`i*.wp.com`) proxy wrapper and query to recover the true origin URLs. */
function originCandidates(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return [rawUrl];
  }
  if (/(^|\.)i\d\.wp\.com$/.test(url.hostname)) {
    // pathname is `/<origin-host>/wp-content/...`; the origin scheme is unknown.
    const inner = url.pathname.replace(/^\//, '');
    const withWww = `http://${inner}`;
    const noWww = `http://${inner.replace(/^www\./, '')}`;
    return withWww === noWww ? [withWww] : [withWww, noWww];
  }
  url.search = '';
  return [url.toString()];
}

const WAYBACK_DELAY_MS = 8000; // archive.org rate-limits aggressively

/** Fetch archived raw bytes for an origin URL at the closest capture (id_ = no toolbar). */
async function fetchArchived(originUrl, timestamp = '2015') {
  return fetchImage(`https://web.archive.org/web/${timestamp}id_/${originUrl}`);
}

/**
 * CDX: find successful (200) image captures whose path shares this origin's
 * filename stem. WordPress serves the full image via a CDN but archives only
 * auto-generated `-<w>x<h>` variants, so the bare origin often 404s while a
 * sized variant is present. Returns rows sorted largest-first.
 */
async function cdxImageCaptures(originUrl) {
  let u;
  try {
    u = new URL(originUrl);
  } catch {
    return [];
  }
  const dir = u.pathname.replace(/[^/]*$/, '');
  const stem = decodeURIComponent(path.basename(u.pathname)).replace(/\.[^.]*$/, '');
  const prefix = `${u.hostname}${dir}${stem}`;
  const api =
    `http://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(prefix)}*` +
    `&matchType=prefix&output=json&collapse=urlkey&limit=100` +
    `&filter=statuscode:200&filter=mimetype:image/.*`;
  // archive.org soft-throttles by returning 200 with an EMPTY body (not 429),
  // which is indistinguishable from "no captures". Since these lookups are only
  // reached for images we have reason to believe were archived, treat an empty
  // result as a probable throttle and retry a few times with a long backoff.
  for (let retries = MAX_429_RETRIES; retries >= 0; retries--) {
    try {
      const res = await fetch(api, { headers: { 'User-Agent': USER_AGENT } });
      if ((res.status === 429 || res.status >= 500) && retries > 0) {
        await sleep(45000);
        continue;
      }
      if (!res.ok) return [];
      const rows = await res.json(); // [ [header...], [urlkey,ts,original,mime,status,digest,length], ... ]
      if (rows.length <= 1 && retries > 0) {
        await sleep(45000); // empty — probable soft-throttle, wait it out
        continue;
      }
      return rows
        .slice(1)
        .map((r) => ({ timestamp: r[1], original: r[2], length: Number(r[6]) || 0 }))
        .sort((a, b) => b.length - a.length); // largest (highest-res) first
    } catch {
      await sleep(5000);
    }
  }
  return [];
}

/**
 * Candidate archived URLs to try via the direct `web/` endpoint (which, unlike
 * CDX, is not aggressively throttled). WordPress names resized files
 * `<stem>-<w>x<h>.<ext>`, which is exactly the Photon `?resize=W,H` value — so we
 * can construct the archived variant directly, no CDX lookup needed. Photon
 * origins often 404 at the bare filename but 200 at the sized variant.
 */
function waybackDirectCandidates(originalUrl) {
  let src;
  try {
    src = new URL(originalUrl);
  } catch {
    return [];
  }
  const resize = (src.searchParams.get('resize') || '').replace('%2C', ',');
  const [w, h] = resize.split(',');

  const candidates = [];
  for (const origin of originCandidates(originalUrl)) {
    const o = new URL(origin);
    const dir = o.pathname.replace(/[^/]*$/, '');
    const file = decodeURIComponent(path.basename(o.pathname));
    const dot = file.lastIndexOf('.');
    const stem = dot >= 0 ? file.slice(0, dot) : file;
    const ext = dot >= 0 ? file.slice(dot) : '';
    if (w && h) candidates.push(`${o.origin}${dir}${stem}-${w}x${h}${ext}`); // resize variant
    candidates.push(origin); // bare original
  }
  return [...new Set(candidates)];
}

/** Try to recover a dead image from the Internet Archive. */
async function fetchFromWayback(originalUrl) {
  // 1) Direct `web/` fetch of derived resize-variants + bare origin (un-throttled
  //    endpoint; a couple of timestamp anchors in case the closest capture 404s).
  for (const cand of waybackDirectCandidates(originalUrl)) {
    for (const ts of ['2014', '2018']) {
      await sleep(WAYBACK_DELAY_MS);
      const r = await fetchArchived(cand, ts);
      if (r.ok) return { ...r, usedUrl: `wayback:${cand}` };
    }
  }

  // 2) Last resort: CDX lookup (often throttled, but harmless to attempt).
  for (const origin of originCandidates(originalUrl)) {
    await sleep(WAYBACK_DELAY_MS);
    const captures = await cdxImageCaptures(origin);
    for (const cap of captures) {
      await sleep(WAYBACK_DELAY_MS);
      const r = await fetchArchived(cap.original, cap.timestamp);
      if (r.ok) return { ...r, usedUrl: `wayback:${cap.original}` };
    }
  }

  return null;
}

/** Fetch full-size variant, then original URL, then the Wayback Machine. */
async function download(originalUrl) {
  const full = fullSizeVariant(originalUrl);
  if (full && full !== originalUrl) {
    const r = await fetchImage(full);
    if (r.ok) return { ...r, usedUrl: full, upgraded: true };
  }
  const orig = await fetchImage(originalUrl);
  if (orig.ok) return { ...orig, usedUrl: originalUrl, upgraded: false };

  const wb = await fetchFromWayback(originalUrl);
  if (wb) return { ...wb, upgraded: false, wayback: true };

  return { ok: false, reason: orig.reason };
}

// ─── Filename ─────────────────────────────────────────────────────────────────

function extFor(originalUrl, contentType) {
  const base = path.basename(new URL(originalUrl).pathname);
  const m = base.match(IMAGE_URL_PATTERN);
  if (m) return m[1].toLowerCase().replace(/^jpeg$/, 'jpg');
  return CONTENT_TYPE_EXT[contentType] || 'jpg';
}

function filenameFor(originalUrl, ext, seq, used) {
  let stem;
  try {
    const base = decodeURIComponent(path.basename(new URL(originalUrl).pathname));
    stem = base.replace(/\.[^.]*$/, ''); // drop existing extension (incl. .php)
    stem = stem.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  } catch {
    stem = '';
  }
  if (!stem) stem = `img-${seq}`;

  let name = `${stem}.${ext}`;
  let n = 2;
  while (used.has(name)) {
    name = `${stem}-${n}.${ext}`;
    n++;
  }
  used.add(name);
  return name;
}

// ─── Reference collection ─────────────────────────────────────────────────────

const BODY_IMAGE_RE = /(!\[[^\]]*\]\(\s*)(https?:\/\/[^)\s]+?)(\s+"[^"]*")?(\s*\))/g;

/** First whitespace-delimited token of a frontmatter image value (drops a trailing "title"). */
function urlToken(value) {
  if (typeof value !== 'string') return undefined;
  const tok = value.trim().split(/\s+/)[0];
  return tok && tok.startsWith('http') ? tok : undefined;
}

function collectUrls(data, body) {
  const urls = new Set();

  const headerUrl = urlToken(data.image);
  if (headerUrl) urls.add(headerUrl);

  if (Array.isArray(data.images)) {
    for (const item of data.images) {
      if (typeof item === 'string' && item.startsWith('http') && IMAGE_URL_PATTERN.test(item)) {
        urls.add(item);
      }
    }
  }

  for (const m of body.matchAll(BODY_IMAGE_RE)) urls.add(m[2]);

  return [...urls];
}

// ─── Reference rewriting (raw text) ───────────────────────────────────────────

const FRONTMATTER_RE = /^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n)/;
// The `image:` field including any indented (folded/block-scalar) continuation lines.
const IMAGE_FIELD_RE = /^image:[^\n]*\n(?:[ \t]+[^\n]*\n)*/m;

function rewriteFrontmatter(fm, headerUrl, map) {
  let out = fm;

  // image: → bare filename (collapses folded scalars, drops any trailing title)
  if (headerUrl && map.has(headerUrl)) {
    out = out.replace(IMAGE_FIELD_RE, `image: ${map.get(headerUrl)}\n`);
  }

  // images[] remote entries → bare filename (exact-substring swap; URLs are unique)
  for (const [url, name] of map) {
    if (url === headerUrl) continue;
    if (out.includes(url)) out = out.split(url).join(name);
  }

  return out;
}

function rewriteBody(body, map) {
  return body.replace(BODY_IMAGE_RE, (whole, pre, url, title, post) =>
    map.has(url) ? `${pre}./${map.get(url)}${title || ''}${post}` : whole
  );
}

// ─── Per-file processing ──────────────────────────────────────────────────────

const summary = { downloaded: 0, upgraded: 0, wayback: 0, filesChanged: 0, skipped: 0, failed: [] };

async function processFile(file) {
  const raw = await readFile(file, 'utf8');
  const parsed = matter(raw);
  const dir = path.dirname(file);

  const urls = collectUrls(parsed.data, parsed.content);
  if (urls.length === 0) return;

  const used = new Set();
  const map = new Map(); // originalUrl -> saved filename
  let seq = 1;

  for (const url of urls) {
    await sleep(REQUEST_DELAY_MS);
    const result = await download(url);
    if (!result.ok) {
      summary.failed.push({ url, file: path.relative(CONTENT_DIR, file), reason: result.reason });
      continue;
    }
    const ext = extFor(url, result.contentType);
    const name = filenameFor(url, ext, seq++, used);
    await writeFile(path.join(dir, name), result.buf);
    map.set(url, name);
    summary.downloaded++;
    if (result.upgraded) summary.upgraded++;
    if (result.wayback) summary.wayback++;
  }

  if (map.size === 0) return;

  const fmMatch = raw.match(FRONTMATTER_RE);
  const headerUrl = urlToken(parsed.data.image);
  let out = raw;
  if (fmMatch) {
    const newFm = rewriteFrontmatter(fmMatch[2], headerUrl, map);
    out = fmMatch[1] + newFm + fmMatch[3] + rewriteBody(raw.slice(fmMatch[0].length), map);
  } else {
    out = rewriteBody(raw, map);
  }

  if (out !== raw) {
    await writeFile(file, out);
    summary.filesChanged++;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const files = await walkMarkdown(CONTENT_DIR);
console.log(`Scanning ${files.length} markdown files…\n`);

for (const file of files) {
  try {
    await processFile(file);
  } catch (err) {
    summary.failed.push({ url: '(file error)', file: path.relative(CONTENT_DIR, file), reason: err.message });
  }
}

console.log(`\nDone.`);
console.log(`  images downloaded: ${summary.downloaded} (${summary.upgraded} upgraded to full size, ${summary.wayback} recovered from Wayback)`);
console.log(`  files rewritten:   ${summary.filesChanged}`);
if (summary.failed.length) {
  console.log(`\n  FAILED (${summary.failed.length}) — left as remote URLs:`);
  for (const f of summary.failed) console.log(`    - ${f.file}\n        ${f.url}\n        (${f.reason})`);
}
