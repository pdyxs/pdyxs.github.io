/**
 * Build step: regenerates src/data/lenses.generated.ts from the
 * `content/<dimension>/<id>.lens.yaml` files.
 *
 * Lenses are authored as YAML files (one per lens, similar to `<name>.tag.yaml`
 * tag declarations) rather than a hardcoded array. This script reads them and
 * emits a typed `LENS_DECLARATIONS` array that src/lib/lens-registry.ts imports.
 *
 * Why a generated .ts and not a runtime read: lens-registry.ts is imported
 * synchronously by client-side Svelte islands (FilterBar, DimensionPanel, ...),
 * which can't touch the filesystem — so the declarations must be a static
 * import. A .ts (not .json) because lens-registry.ts is also imported by the
 * Node build scripts, and Node's type-stripping rejects assertion-less JSON
 * imports; a .ts module sidesteps that and gets `astro check` validation.
 *
 * IMPORTANT: this script must not import lens-registry.ts (or anything that
 * does), or it would depend on the very file it generates. It reads YAML with
 * js-yaml and nothing else from the project.
 *
 * Run automatically before `npm run dev`/`build` via the "pre*" lifecycle
 * scripts, ordered BEFORE generate-stack-manifest.mjs (manifest enumeration
 * reads the lens registry). Safe to run manually:
 *   node scripts/generate-lens-registry.mjs
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(__dirname, '../src/content');
const OUT_PATH = path.resolve(__dirname, '../src/data/lenses.generated.ts');

const LENS_YAML_SUFFIX = '.lens.yaml';

// The 5W dimensions a lens can be filed under. Hardcoded (rather than imported
// from src/lib/filters.ts) to keep this generator free of any project import
// that would transitively pull in lens-registry.ts — see the header note.
const DIMENSIONS = ['who', 'what', 'when', 'where', 'why'];

// Keys emitted onto a declaration, in a stable order. `order` is intentionally
// absent: it drives sorting here, then is dropped (it isn't a registry field).
const DECL_KEYS = ['id', 'dimension', 'label', 'icon', 'component', 'width', 'acceptsFilters', 'presentation', 'devOnly', 'config'];

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
    } else if (entry.name.endsWith(LENS_YAML_SUFFIX)) {
      out.push(full);
    }
  }
  return out;
}

async function collectLenses() {
  const files = await walk(CONTENT_DIR);
  const lenses = [];

  for (const file of files) {
    const rel = path.relative(CONTENT_DIR, file);
    const dimension = rel.split(path.sep)[0];
    if (!DIMENSIONS.includes(dimension)) {
      console.warn(`lens: skipping ${rel} — "${dimension}" is not a known dimension`);
      continue;
    }
    const id = path.basename(file).slice(0, -LENS_YAML_SUFFIX.length);
    const parsed = (parseYaml(await readFile(file, 'utf-8')) ?? {});

    if (typeof parsed.label !== 'string' || parsed.label.length === 0) {
      throw new Error(`lens: ${rel} is missing a required "label"`);
    }

    const decl = {
      id,
      dimension,
      label: parsed.label,
      // component defaults to the id — most lenses have no bespoke loader and
      // fall through to the default browse body (see lens-components.ts).
      component: typeof parsed.component === 'string' ? parsed.component : id,
      // order is generator-only: it sorts the output, then is dropped.
      order: typeof parsed.order === 'number' ? parsed.order : Number.POSITIVE_INFINITY,
    };
    if (typeof parsed.icon === 'string') decl.icon = parsed.icon;
    if (typeof parsed.width === 'string') decl.width = parsed.width;
    if (typeof parsed.acceptsFilters === 'boolean') decl.acceptsFilters = parsed.acceptsFilters;
    if (typeof parsed.presentation === 'string') decl.presentation = parsed.presentation;
    if (typeof parsed.devOnly === 'boolean') decl.devOnly = parsed.devOnly;
    if (parsed.config && typeof parsed.config === 'object') decl.config = parsed.config;

    lenses.push(decl);
  }

  // Deterministic order: by dimension, then declared order, then id. Registry
  // consumers (e.g. lensesForDimension) preserve array order, so this fixes the
  // order lenses appear within a dimension's panel.
  lenses.sort((a, b) =>
    a.dimension.localeCompare(b.dimension) || a.order - b.order || a.id.localeCompare(b.id),
  );

  // Strip the generator-only `order` before serialising.
  return lenses.map(({ order, ...decl }) => {
    const ordered = {};
    for (const key of DECL_KEYS) {
      if (key in decl) ordered[key] = decl[key];
    }
    return ordered;
  });
}

async function main() {
  const declarations = await collectLenses();

  const body = `// AUTO-GENERATED by scripts/generate-lens-registry.mjs — do not edit by hand.
// Source: src/content/<dimension>/<id>.lens.yaml. Regenerated on predev/prebuild.
import type { LensDeclaration } from '../lib/lens-registry.ts';

export const LENS_DECLARATIONS: LensDeclaration[] = ${JSON.stringify(declarations, null, 2)};
`;

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, body, 'utf-8');
  console.log(`lens-registry: ${declarations.length} lenses -> src/data/lenses.generated.ts`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
