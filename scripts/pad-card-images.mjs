#!/usr/bin/env node
/**
 * Build step: applies each card's `imagePad:` to its header image.
 *
 * Some source images are cropped flush to their content — the logic-masters
 * puzzle exports all sit at a 0–1% margin — and the full-bleed masthead then
 * butts that content against the card border. Whether that reads as damage or
 * as a deliberate frame depends on what is at the edge, which no measurement
 * can decide, so the amount is authored per card:
 *
 *     image: bild.png
 *     imagePad: 5%
 *
 * The unpadded source is preserved at `<card>/_original/<file>` and every run
 * re-pads from it, so changing 5% to 8% is a fresh pad rather than 8% added on
 * top of 5%. Removing `imagePad` (or setting it to 0) puts the original back.
 * `_original/` is an underscore directory, so it is already invisible to the
 * content glob, the gallery sweep and the audit lens.
 *
 * All decisions live in src/lib/image-padding.ts; this is the fs + sharp shell.
 *
 * Deliberately NOT a predev/prebuild step. Its output is committed image files,
 * it needs running only when a value changes, and wiring it into every dev boot
 * would rewrite assets on a machine that never touched them. Run it by hand:
 *
 *   npm run pad:images            # apply
 *   npm run pad:images -- --check # report what would change, write nothing
 */

import { readdir, readFile, mkdir, rename, copyFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import sharp from 'sharp';
import { isVaultInfrastructurePath } from '../src/lib/content-glob.ts';
import {
  ORIGINAL_DIR,
  planImagePadding,
  resolvePadPixels,
  chooseBackground,
  summarise,
} from '../src/lib/image-padding.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(__dirname, '../src/content');
const CHECK_ONLY = process.argv.includes('--check');

const exists = (p) => access(p).then(() => true, () => false);

/** Every card's index.md, skipping vault infrastructure (`_`/`.` segments). */
async function cardFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (isVaultInfrastructurePath(path.relative(CONTENT_DIR, full))) continue;
    if (entry.isDirectory()) found.push(...(await cardFiles(full)));
    else if (entry.name.endsWith('.md')) found.push(full);
  }
  return found;
}

/** Reads what is on disk for every card, with no interpretation applied. */
async function collectCandidates() {
  const candidates = [];
  for (const file of await cardFiles(CONTENT_DIR)) {
    const { data } = matter(await readFile(file, 'utf8'));
    const dir = path.dirname(file);
    const uid = path.relative(CONTENT_DIR, dir);
    const image = typeof data.image === 'string' ? data.image : undefined;

    // Only a local image can have an original stored beside it.
    const local = image && !image.startsWith('http');
    candidates.push({
      uid,
      image,
      imagePad: data.imagePad,
      hasOriginal: local ? await exists(path.join(dir, ORIGINAL_DIR, image)) : false,
      hasCurrent: local ? await exists(path.join(dir, image)) : false,
      dir,
    });
  }
  return candidates;
}

/**
 * Pads one image from its stored original.
 *
 * The border colour is sampled from the original's own four corners rather than
 * hardcoded white — see chooseBackground. Sampling reads the four 1×1 corners
 * out of the raw buffer rather than resizing, so the value is the actual corner
 * pixel and not an average of its neighbourhood.
 */
async function padImage(source, destination, spec) {
  const image = sharp(source);
  const { width, height } = await image.metadata();
  const { data, info } = await image
    .clone()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const at = (x, y) => {
    const i = (y * info.width + x) * info.channels;
    return { r: data[i], g: data[i + 1], b: data[i + 2], alpha: data[i + 3] / 255 };
  };
  const background = chooseBackground([
    at(0, 0),
    at(info.width - 1, 0),
    at(0, info.height - 1),
    at(info.width - 1, info.height - 1),
  ]);

  const pad = resolvePadPixels(spec, width, height);
  await sharp(source)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background })
    .toFile(destination);

  return { pad, width, height, background };
}

async function main() {
  const candidates = await collectCandidates();
  const actions = planImagePadding(candidates);
  const byUid = new Map(candidates.map((c) => [c.uid, c]));
  const done = [];

  for (const action of actions) {
    if (action.action === 'skip' || action.action === 'error') continue;
    const { dir, image } = { ...byUid.get(action.uid), image: action.image };
    const current = path.join(dir, image);
    const original = path.join(dir, ORIGINAL_DIR, image);

    if (action.action === 'restore') {
      if (!CHECK_ONLY) await copyFile(original, current);
      done.push(`  restored  ${action.uid}/${image}`);
      continue;
    }

    if (CHECK_ONLY) {
      done.push(`  would pad ${action.uid}/${image} by ${action.spec.value}${action.spec.unit === 'percent' ? '%' : 'px'}`);
      continue;
    }

    // First opt-in: the file sitting in the card folder IS the original.
    if (action.adopt) {
      await mkdir(path.dirname(original), { recursive: true });
      await rename(current, original);
    }

    // sharp cannot read and write the same path in one pipeline.
    const temp = `${current}.padding.tmp`;
    const { pad } = await padImage(original, temp, action.spec);
    await rename(temp, current);
    done.push(`  padded    ${action.uid}/${image} +${pad}px${action.adopt ? ' (original stored)' : ''}`);
  }

  const summary = summarise(actions);
  for (const line of done) console.log(line);
  console.log(
    `\npad-card-images: ${summary.padded} padded, ${summary.restored} restored, ${summary.skipped} untouched.`
  );

  if (summary.errors.length > 0) {
    console.error(`\n${summary.errors.length} card(s) declare imagePad but could not be padded:`);
    for (const e of summary.errors) console.error(`  ${e.uid}: ${e.reason}`);
    process.exitCode = 1;
  }
}

await main();
