/**
 * Pure decisions behind the generated Templater card scaffolds (issue #55).
 *
 * A card is a folder with an `index.md` (DEC-005), so authoring one by hand in
 * the content vault means making a folder, making the file, and remembering
 * which frontmatter fields the schema offers. The generator
 * (`scripts/generate-card-templates.mjs`) removes that by emitting one
 * Templater template per container folder into `src/content/_templates/`.
 *
 * Everything here is pure: the container folders and the schema source are
 * passed in as data, and a template's text comes back as a string. The script
 * is the thin applier that reads the filesystem and writes the files.
 *
 * Scope (issue #55, option (a)): a template's field list comes from the content
 * schema (`src/content.config.ts`) plus whatever the folder's cascaded
 * `_config.yaml` already sets. There is deliberately no per-renderer field-set
 * registry — the schema's own `// ── section ──` banners are the only grouping
 * that exists, and a folder picks up a section when a path segment names it.
 */

/** One field declared on the content collection schema. */
export type SchemaField = {
  /** Frontmatter key. */
  name: string;
  /** The `// ── … ──` banner the field was declared under. */
  section: string;
  /** Short human hint about the accepted value, e.g. `string`, `date (YYYY-MM-DD)`. */
  hint: string;
};

/** A field as it will appear in a generated template. */
export type TemplateField = {
  name: string;
  /** Rendered value for a prefilled field; absent for a commented-out suggestion. */
  value?: string;
  hint?: string;
};

/** The subset of a folder's `_config.yaml` cascade a template cares about. */
export type ScaffoldCascade = {
  renderer?: string;
  navRenderer?: string;
  status?: string;
  cardDescriptionParts?: string[];
  /** Nearest-ancestor override values, keyed as in `resolveFolderCascade`. */
  overrides?: Record<string, string>;
};

/** A container folder that gets a template: its content-relative path plus its cascade. */
export type ContainerFolder = {
  /** Path relative to `src/content`, e.g. `what/puzzles`. */
  path: string;
  /** The folder's own `_config.yaml` display name, if it declares one. */
  name?: string;
  cascade: ScaffoldCascade;
};

/**
 * Sections that describe *how a card is resolved* rather than what it is
 * about. They cascade from `_config.yaml`, so repeating them per card is a
 * mistake, not a convenience — the template names the inherited values in a
 * trailing comment instead.
 *
 * `location` and `era` used to be here; issue #116 retired both fields, so
 * there is nothing left to filter out. `excludeTags` is deliberately NOT
 * added: unlike these two it is legitimately per-card as well as cascading.
 */
const CASCADE_ONLY_FIELDS = new Set(['renderer', 'navRenderer']);

/** Fields the template prefills itself, so they must not also be offered as suggestions. */
const PREFILLED_FIELDS = new Set(['title', 'status', 'date', 'tags']);

/**
 * Sections every template gets, whatever folder it is for. `common` is the
 * shared card identity; `generated-tag overrides` is mostly cascade knobs
 * (filtered out above) but is also where `image` is declared.
 */
const UNIVERSAL_SECTIONS = ['common', 'generated-tag overrides'];

// ─── Schema parsing ───────────────────────────────────────────────────────────

const SECTION_BANNER = /^\s*\/\/\s*──\s*(.+?)\s*──\s*$/;
const FIELD_DECL = /^\s{8}(\w+):\s*(z\..*)$/;

/**
 * Reads the field list straight out of `src/content.config.ts` rather than
 * duplicating it here — a schema field added without touching this file still
 * shows up in the next regen.
 *
 * The parse is deliberately shallow: only the top-level `schema: z.object({…})`
 * body, only 8-space-indented `name: z.…` lines, and only the `// ── … ──`
 * banners already used to group that body.
 */
export function parseSchemaFields(source: string): SchemaField[] {
  const lines = source.split('\n');
  const start = lines.findIndex((l) => /schema:\s*z\.object\(\{/.test(l));
  if (start === -1) return [];

  const fields: SchemaField[] = [];
  let section = '';
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    // The schema object body closes at the first line dedented back to the
    // collection level.
    if (/^\s{4}\}\)/.test(line)) break;

    const banner = line.match(SECTION_BANNER);
    if (banner) {
      section = banner[1];
      continue;
    }
    const field = line.match(FIELD_DECL);
    if (field) {
      fields.push({ name: field[1], section, hint: hintFor(field[2]) });
    }
  }
  return fields;
}

/** Turns a zod expression into a short authoring hint. */
function hintFor(expr: string): string {
  if (/^z\.array\(action\)/.test(expr)) return 'list of { text, url }';
  if (/^z\.array\(quote\)/.test(expr)) return 'list of { quote, by?, in? }';
  if (/^z\.array\(z\.string\(\)\)/.test(expr)) return 'list of strings';
  if (/^z\.coerce\.date\(\)/.test(expr)) return 'date (YYYY-MM-DD)';
  if (/^z\.number\(\)/.test(expr)) return 'number';
  if (/^z\.boolean\(\)/.test(expr)) return 'true | false';
  if (/^z\.url\(\)/.test(expr)) return 'url';
  const enumMatch = expr.match(/^z\.enum\(\[(.+?)\]\)/);
  if (enumMatch) {
    return enumMatch[1]
      .split(',')
      .map((v) => v.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
      .join(' | ');
  }
  return 'string';
}

// ─── Field selection ──────────────────────────────────────────────────────────

/**
 * Which schema sections a folder's template offers.
 *
 * A folder opts into a section by naming it: any path segment that matches one
 * of the section label's slash-separated words (`posts / writing` → `posts`,
 * `writing`) pulls that section in. This is the whole of the type-specific
 * tailoring — no renderer→fields registry exists, and issue #55 deliberately
 * did not add one.
 */
export function selectFolderSections(folderPath: string, allSections: string[]): string[] {
  const segments = new Set(folderPath.split('/').map((s) => s.toLowerCase()));
  const matched = allSections.filter((section) => {
    if (UNIVERSAL_SECTIONS.includes(section)) return false;
    return section
      .split('/')
      .map((word) => word.trim().toLowerCase())
      .some((word) => word.length > 0 && segments.has(word));
  });
  return [...UNIVERSAL_SECTIONS.filter((s) => allSections.includes(s)), ...matched];
}

/** Frontmatter keys referenced by a folder's cascaded `cardDescriptionParts` templates. */
export function fieldsFromDescriptionParts(parts: string[] | undefined): string[] {
  const found: string[] = [];
  for (const part of parts ?? []) {
    for (const match of part.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) {
      if (!found.includes(match[1])) found.push(match[1]);
    }
  }
  return found;
}

/**
 * The suggestion list for a folder: every field from its selected sections,
 * in schema order, minus what the template prefills and minus the cascade-only
 * knobs. Fields named by `cardDescriptionParts` are always included even if
 * their section did not match, since the folder demonstrably uses them.
 */
export function selectTemplateFields(
  folder: ContainerFolder,
  schemaFields: SchemaField[]
): TemplateField[] {
  const allSections: string[] = [];
  for (const f of schemaFields) if (!allSections.includes(f.section)) allSections.push(f.section);

  const sections = new Set(selectFolderSections(folder.path, allSections));
  const described = new Set(fieldsFromDescriptionParts(folder.cascade.cardDescriptionParts));

  return schemaFields
    .filter((f) => sections.has(f.section) || described.has(f.name))
    .filter((f) => !PREFILLED_FIELDS.has(f.name) && !CASCADE_ONLY_FIELDS.has(f.name))
    .map((f) => ({ name: f.name, hint: f.hint }));
}

// ─── Rendering ────────────────────────────────────────────────────────────────

/** Flat filename a folder's template is written to, e.g. `what/puzzles` → `what-puzzles.md`. */
export function templateFileName(folderPath: string): string {
  return `${folderPath.replace(/\//g, '-')}.md`;
}

/**
 * The cascaded values a card in this folder inherits, as `key: value` strings.
 *
 * Only the two cascade-only fields. It used to also walk `cascade.overrides`
 * for anything in CASCADE_ONLY_FIELDS, which covered `location`/`era` — both
 * retired in issue #116. What is left in `overrides` is `difficulty`, which is
 * inherently per-card (every puzzle has its own) and so is never something a
 * card "must not repeat"; the loop could only ever have matched nothing.
 */
export function inheritedNotes(cascade: ScaffoldCascade): string[] {
  const notes: string[] = [];
  if (cascade.renderer) notes.push(`renderer: ${cascade.renderer}`);
  if (cascade.navRenderer) notes.push(`navRenderer: ${cascade.navRenderer}`);
  return notes;
}

const SLUGIFY_JS =
  'title.toLowerCase().normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "")' +
  '.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")';

/**
 * The full text of a folder's Templater template.
 *
 * Running it prompts for a title, slugifies it, moves the new note to
 * `<folder>/<slug>/index.md` (creating the card folder — DEC-005), and writes
 * a draft-status frontmatter block with the folder's suggested fields
 * commented out beneath it. Commented lines are ordinary YAML comments, so the
 * file passes the content schema the moment it is created.
 */
export function renderCardTemplate(
  folder: ContainerFolder,
  schemaFields: SchemaField[],
  options: { generatorPath: string }
): string {
  const fields = selectTemplateFields(folder, schemaFields);
  const notes = inheritedNotes(folder.cascade);
  const label = folder.name ? `${folder.name} (${folder.path})` : folder.path;
  const pad = Math.max(0, ...fields.map((f) => f.name.length)) + 2;

  const lines = [
    '<%*',
    `// New card in ${label}.`,
    `// GENERATED by ${options.generatorPath} — do not edit by hand.`,
    'const title = await tp.system.prompt("Card title");',
    'if (!title) { new Notice("Card creation cancelled — no title given."); return; }',
    `const slug = ${SLUGIFY_JS};`,
    `await tp.file.move(\`/${folder.path}/\${slug}/index\`);`,
    '-%>',
    '---',
    'title: <% JSON.stringify(title) %>',
    'status: draft',
    'date: <% tp.date.now("YYYY-MM-DD") %>',
    'tags: []',
  ];

  if (fields.length > 0) {
    lines.push('# Optional fields for this folder — uncomment the ones you need.');
    for (const field of fields) {
      lines.push(`# ${field.name}:${' '.repeat(pad - field.name.length)}# ${field.hint}`);
    }
  }

  if (notes.length > 0) {
    lines.push("# Inherited from the _config.yaml cascade — don't repeat these here:");
    for (const note of notes) lines.push(`#   ${note}`);
  }

  lines.push('---', '', '<% tp.file.cursor() %>', '');
  return lines.join('\n');
}
