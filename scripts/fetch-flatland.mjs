#!/usr/bin/env node
/**
 * Downloads the pinned Flatland: Fallen Angle web build into
 * public/games/flatland/ (gitignored), so the build never enters this repo.
 *
 * The release lives in the private repo pdyxs/flatland-fallen-angle-web, so the
 * download goes through `gh`, which reads GH_TOKEN / GITHUB_TOKEN or the local
 * `gh auth` login. In CI that token must be able to read that repo's releases.
 *
 * Skips the download when public/games/flatland/.version already holds the
 * pinned version (decision: src/lib/flatland/release.ts).
 *
 * Run via `npm run generate:flatland` (a predev/prebuild step).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { needsFetch, releaseAssetName } from '../src/lib/flatland/release.ts';

const FLATLAND_VERSION = 'v1.0.0';
const REPO = 'pdyxs/flatland-fallen-angle-web';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TARGET = join(ROOT, 'public/games/flatland');
const MARKER = join(TARGET, '.version');

const installed = existsSync(MARKER) ? readFileSync(MARKER, 'utf8') : undefined;
if (!needsFetch(installed, FLATLAND_VERSION)) {
  console.log(`flatland ${FLATLAND_VERSION} already present`);
  process.exit(0);
}

const work = mkdtempSync(join(tmpdir(), 'flatland-'));
try {
  const asset = releaseAssetName(FLATLAND_VERSION);
  console.log(`fetching flatland ${FLATLAND_VERSION} from ${REPO}`);
  execFileSync('gh', ['release', 'download', FLATLAND_VERSION, '--repo', REPO, '--pattern', asset, '--dir', work], { stdio: 'inherit' });
  const unpacked = join(work, 'unpacked');
  mkdirSync(unpacked);
  execFileSync('unzip', ['-q', join(work, asset), '-d', unpacked], { stdio: 'inherit' });
  if (!existsSync(join(unpacked, 'index.html'))) throw new Error(`${asset} has no index.html at its root`);
  writeFileSync(join(unpacked, '.version'), FLATLAND_VERSION + '\n');
  rmSync(TARGET, { recursive: true, force: true });
  mkdirSync(join(TARGET, '..'), { recursive: true });
  cpSync(unpacked, TARGET, { recursive: true });
} catch (err) {
  console.error(`Could not fetch flatland ${FLATLAND_VERSION}: ${err.message}`);
  console.error('The private release needs GH_TOKEN (or a gh login) with read access to ' + REPO);
  process.exit(1);
} finally {
  rmSync(work, { recursive: true, force: true });
}
