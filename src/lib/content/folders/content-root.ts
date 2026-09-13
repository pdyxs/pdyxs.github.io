// The one place the absolute path of the content tree is decided.
//
// It is resolved from `process.cwd()`, NOT from `import.meta.url`. Every
// consumer here runs in one of three contexts — `astro dev`, `astro build` and
// plain Node (the `scripts/*.mjs` generators, and vitest) — and in all three the
// process is started at the repo root, so cwd is stable. The module's *own*
// location is not: `astro build` bundles these modules into the prerender
// output, where `import.meta.url` points at `dist/.prerender/...` and
// `../content` resolves to a directory that has never existed. That was
// pdyxs/pdyxs.github.io#88 — every `_config.yaml` read as absent and the whole
// folder cascade silently yielded nothing in production, while dev (running from
// source) looked correct.
//
// An Astro virtual module would fix the build but not the other two contexts,
// which is why cwd wins.

import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Absolute path to the content tree (`<repo>/src/content`). */
export const CONTENT_ROOT = resolve(process.cwd(), 'src', 'content');

/** Memoised so the verification walk below runs once per process, not once per reader. */
let verified = false;

/** Counts `_config.yaml` files under `dir`, stopping as soon as `limit` is reached. */
function countConfigFiles(dir: string, limit = 1): number {
  let found = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      found += countConfigFiles(join(dir, entry.name), limit - found);
    } else if (entry.name === '_config.yaml') {
      found++;
    }
    if (found >= limit) return found;
  }
  return found;
}

/**
 * Returns CONTENT_ROOT, throwing if it isn't a readable content tree.
 *
 * Both readers below swallow ENOENT per file, because "this folder has no
 * `_config.yaml`" is the normal case and must stay cheap. That makes a missing
 * *file* and an unreadable *tree* indistinguishable at the call site — which is
 * exactly how #88 survived. So the distinction is drawn once, here, at reader
 * construction: a tree that yields zero `_config.yaml` files is not a content
 * tree, and that is a hard error rather than an empty cascade.
 */
export function assertContentRoot(): string {
  if (verified) return CONTENT_ROOT;
  if (!existsSync(CONTENT_ROOT)) {
    throw new Error(
      `Content root not found at ${CONTENT_ROOT} (cwd: ${process.cwd()}). ` +
        `Content-relative paths resolve from the working directory — run from the repo root.`
    );
  }
  if (countConfigFiles(CONTENT_ROOT) === 0) {
    throw new Error(
      `Content root ${CONTENT_ROOT} contains no _config.yaml — the folder cascade ` +
        `would silently resolve to nothing. Check that this is the real content tree.`
    );
  }
  verified = true;
  return CONTENT_ROOT;
}
