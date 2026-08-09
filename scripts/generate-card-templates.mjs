/**
 * Build step: regenerates the Templater card scaffolds in
 * `src/content/_templates/` (issue #55).
 *
 * A card is a folder with an `index.md` (DEC-005), which makes hand-authoring
 * one in the content vault fiddly: make the folder, make the file, remember
 * which frontmatter fields exist. This script emits one Templater template per
 * container folder so "new card here" is a single command in Obsidian.
 *
 * What a container folder is: any directory under `src/content` holding a
 * `_config.yaml` that declares a `name` — i.e. a folder with a tag identity,
 * which is what a card can be filed under. Dimension-level configs that only
 * carry panel settings (e.g. `where/_config.yaml`, `groupOrder` only) are not
 * containers and get no template.
 *
 * All the decisions live in src/lib/templater-scaffold.ts (pure, unit-tested).
 * This script is the thin applier: walk for `_config.yaml` → resolve each
 * folder's cascade via `resolveFolderCascade` → parse the content schema →
 * render → write.
 *
 * Re-runnable: it clears every `.md` in `_templates/` except `README.md` before
 * writing, so a renamed or deleted folder leaves no stale template behind.
 * Output is deterministic, so an unchanged folder tree produces no diff.
 *
 * Run automatically before `npm run dev`/`build` via the "pre*" lifecycle
 * scripts. Safe to run manually:
 *   npm run generate:card-templates
 *
 * Note: `_templates` is kept out of the content collection because
 * CONTENT_GLOB_PATTERN (src/lib/content-glob.ts) only matches under the five
 * dimension roots, so nothing written here can become a card.
 */

import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveFolderCascade, makeFileReader } from '../src/lib/folder-config.ts';
import {
  parseSchemaFields,
  renderCardTemplate,
  templateFileName,
} from '../src/lib/templater-scaffold.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(REPO_ROOT, 'src/content');
const OUT_DIR = path.join(CONTENT_DIR, '_templates');
const SCHEMA_PATH = path.join(REPO_ROOT, 'src/content.config.ts');
const GENERATOR_PATH = 'scripts/generate-card-templates.mjs';

/** Keys resolveFolderCascade should surface as `overrides` (see the schema's generated-tag overrides). */
const OVERRIDE_KEYS = ['location', 'era'];

/** Files in `_templates` the generator does not own. */
const PRESERVED = new Set(['README.md']);

/** Every directory under src/content that holds a `_config.yaml`, content-relative. */
async function findConfigDirs(dir = CONTENT_DIR, rel = '') {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      // `_`-prefixed dirs (templates, Templater scaffolds) and `.obsidian`
      // are vault plumbing, never content containers.
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
      out.push(...(await findConfigDirs(path.join(dir, entry.name), rel ? `${rel}/${entry.name}` : entry.name)));
    } else if (entry.name === '_config.yaml' && rel) {
      out.push(rel);
    }
  }
  return out.sort();
}

async function main() {
  const reader = makeFileReader();
  const dirs = await findConfigDirs();

  const folders = [];
  for (const dir of dirs) {
    // Pass a pseudo-card uid inside the folder so the folder's own
    // `_config.yaml` counts as an ancestor — resolveFolderCascade never applies
    // a config to the file sitting beside it.
    const cascade = await resolveFolderCascade(`${dir}/card`, reader, OVERRIDE_KEYS);
    const name = cascade.tagIdentity.name;
    if (!name) continue; // panel-only dimension config, not a card container
    folders.push({ path: dir, name, cascade });
  }

  const schemaFields = parseSchemaFields(await readFile(SCHEMA_PATH, 'utf-8'));
  if (schemaFields.length === 0) {
    throw new Error(`card-templates: no fields parsed from ${SCHEMA_PATH} — refusing to emit empty templates`);
  }

  await mkdir(OUT_DIR, { recursive: true });
  for (const entry of await readdir(OUT_DIR)) {
    if (entry.endsWith('.md') && !PRESERVED.has(entry)) {
      await rm(path.join(OUT_DIR, entry));
    }
  }

  for (const folder of folders) {
    const text = renderCardTemplate(folder, schemaFields, { generatorPath: GENERATOR_PATH });
    await writeFile(path.join(OUT_DIR, templateFileName(folder.path)), text, 'utf-8');
  }

  console.log(
    `card-templates: ${folders.length} templates from ${schemaFields.length} schema fields → src/content/_templates/`,
  );
  for (const folder of folders) {
    console.log(`  ${templateFileName(folder.path).padEnd(34)} ${folder.name}`);
  }
}

await main();
