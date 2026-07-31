import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';
import {
  parseSchemaFields,
  selectFolderSections,
  fieldsFromDescriptionParts,
  selectTemplateFields,
  templateFileName,
  inheritedNotes,
  renderCardTemplate,
  type SchemaField,
} from './templater-scaffold';

const SCHEMA_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../content.config.ts');

const fixtureFields: SchemaField[] = [
  { name: 'title', section: 'common', hint: 'string' },
  { name: 'description', section: 'common', hint: 'string' },
  { name: 'tags', section: 'common', hint: 'list of strings' },
  { name: 'date', section: 'common', hint: 'date (YYYY-MM-DD)' },
  { name: 'location', section: 'generated-tag overrides', hint: 'string' },
  { name: 'renderer', section: 'generated-tag overrides', hint: 'string' },
  { name: 'status', section: 'generated-tag overrides', hint: 'draft | published' },
  { name: 'image', section: 'generated-tag overrides', hint: 'string' },
  { name: 'source', section: 'posts / writing', hint: 'string' },
  { name: 'order', section: 'stories', hint: 'number' },
  { name: 'difficulty', section: 'puzzles', hint: 'string' },
  { name: 'puzzle_type', section: 'puzzles', hint: 'string' },
  { name: 'roles', section: 'work', hint: 'string' },
];

const generatorPath = 'scripts/generate-card-templates.mjs';

describe('parseSchemaFields', () => {
  it('reads sections and fields from the real content schema', async () => {
    const fields = parseSchemaFields(await readFile(SCHEMA_PATH, 'utf-8'));
    const byName = new Map(fields.map((f) => [f.name, f]));

    expect(byName.get('title')?.section).toBe('common');
    expect(byName.get('difficulty')?.section).toBe('puzzles');
    expect(byName.get('roles')?.section).toBe('work');
    expect(byName.get('order')).toEqual({
      name: 'order',
      section: 'stories',
      hint: 'number',
    });
    // Nested helper objects (`action`, `quote`) are declared outside the
    // collection schema and must not leak in as fields.
    expect(byName.has('quote')).toBe(false);
    expect(byName.has('collections')).toBe(false);
  });

  it('derives value hints from the zod expression', () => {
    const source = [
      '    schema: z.object({',
      '        // ── common ──',
      '        title: z.string().optional(),',
      '        date: z.coerce.date().optional(),',
      '        tags: z.array(z.string()).default([]),',
      '        priority: z.number().optional(),',
      '        panel: z.boolean().optional(),',
      '        url: z.url().optional(),',
      "        status: z.enum(['draft', 'published']).optional(),",
      '        actions: z.array(action).default([]),',
      '        quotes: z.array(quote).default([]),',
      '    }),',
      '});',
    ].join('\n');

    expect(parseSchemaFields(source).map((f) => `${f.name}=${f.hint}`)).toEqual([
      'title=string',
      'date=date (YYYY-MM-DD)',
      'tags=list of strings',
      'priority=number',
      'panel=true | false',
      'url=url',
      'status=draft | published',
      'actions=list of { text, url }',
      'quotes=list of { quote, by?, in? }',
    ]);
  });

  it('returns nothing when the source has no collection schema', () => {
    expect(parseSchemaFields('export const x = 1;\n')).toEqual([]);
  });
});

describe('selectFolderSections', () => {
  const sections = [
    'common',
    'generated-tag overrides',
    'posts / writing',
    'stories',
    'work',
    'puzzles',
  ];

  it('always includes the universal sections', () => {
    expect(selectFolderSections('what/art', sections)).toEqual([
      'common',
      'generated-tag overrides',
    ]);
  });

  it('matches a section when a path segment names it', () => {
    expect(selectFolderSections('what/puzzles', sections)).toContain('puzzles');
    expect(selectFolderSections('where/work', sections)).toContain('work');
  });

  it('matches either word of a slash-separated section label', () => {
    expect(selectFolderSections('what/posts', sections)).toContain('posts / writing');
    expect(selectFolderSections('what/writing', sections)).toContain('posts / writing');
  });

  it('accumulates every section a nested folder names', () => {
    expect(selectFolderSections('what/posts/stories/arctic', sections)).toEqual([
      'common',
      'generated-tag overrides',
      'posts / writing',
      'stories',
    ]);
  });
});

describe('fieldsFromDescriptionParts', () => {
  it('extracts the field names a cardDescriptionParts template interpolates', () => {
    expect(fieldsFromDescriptionParts(['{{puzzle_type}}', 'Level {{ difficulty }}'])).toEqual([
      'puzzle_type',
      'difficulty',
    ]);
  });

  it('dedupes and tolerates an absent list', () => {
    expect(fieldsFromDescriptionParts(['{{a}} {{a}}'])).toEqual(['a']);
    expect(fieldsFromDescriptionParts(undefined)).toEqual([]);
  });
});

describe('selectTemplateFields', () => {
  it('offers the universal fields minus prefilled and cascade-only ones', () => {
    const fields = selectTemplateFields({ path: 'what/art', cascade: {} }, fixtureFields);
    expect(fields.map((f) => f.name)).toEqual(['description', 'image']);
  });

  it('adds the fields of a section the folder names, in schema order', () => {
    const fields = selectTemplateFields({ path: 'what/puzzles', cascade: {} }, fixtureFields);
    expect(fields.map((f) => f.name)).toEqual([
      'description',
      'image',
      'difficulty',
      'puzzle_type',
    ]);
  });

  it('includes a cardDescriptionParts field even when its section did not match', () => {
    const fields = selectTemplateFields(
      { path: 'what/art', cascade: { cardDescriptionParts: ['{{roles}}'] } },
      fixtureFields
    );
    expect(fields.map((f) => f.name)).toContain('roles');
  });

  it('never offers a field the template prefills or the folder cascade owns', () => {
    const names = selectTemplateFields(
      { path: 'what/posts/stories', cascade: {} },
      fixtureFields
    ).map((f) => f.name);
    for (const excluded of ['title', 'tags', 'date', 'status', 'renderer', 'location']) {
      expect(names).not.toContain(excluded);
    }
  });
});

describe('templateFileName', () => {
  it('flattens the folder path', () => {
    expect(templateFileName('what/puzzles')).toBe('what-puzzles.md');
    expect(templateFileName('what/posts/stories/arctic')).toBe('what-posts-stories-arctic.md');
  });
});

describe('inheritedNotes', () => {
  it('lists the cascaded values a card must not repeat', () => {
    expect(
      inheritedNotes({
        renderer: 'story',
        navRenderer: 'series',
        overrides: { location: 'europe/norway/svalbard' },
      })
    ).toEqual([
      'renderer: story',
      'navRenderer: series',
      'location: europe/norway/svalbard',
    ]);
  });

  it('is empty for a folder that cascades nothing', () => {
    expect(inheritedNotes({})).toEqual([]);
  });
});

describe('renderCardTemplate', () => {
  const puzzle = renderCardTemplate(
    { path: 'what/puzzles', name: 'Puzzles', cascade: { renderer: 'puzzle' } },
    fixtureFields,
    { generatorPath }
  );

  it('creates the card folder + index.md from a prompted title', () => {
    expect(puzzle).toContain('const title = await tp.system.prompt("Card title");');
    expect(puzzle).toContain('await tp.file.move(`/what/puzzles/${slug}/index`);');
  });

  it('prefills the required draft frontmatter', () => {
    const frontmatter = puzzle.split('---')[1];
    expect(frontmatter).toContain('title: <% JSON.stringify(title) %>');
    expect(frontmatter).toContain('status: draft');
    expect(frontmatter).toContain('date: <% tp.date.now("YYYY-MM-DD") %>');
    expect(frontmatter).toContain('tags: []');
  });

  it('offers the folder fields as YAML comments, so the card parses as-created', () => {
    const frontmatter = puzzle.split('---')[1];
    expect(frontmatter).toMatch(/^# difficulty:\s+# string$/m);
    expect(frontmatter).toMatch(/^# puzzle_type:\s+# string$/m);
    for (const line of frontmatter.trim().split('\n')) {
      expect(line.startsWith('#') || /^\w+:/.test(line)).toBe(true);
    }
  });

  it('names the inherited cascade rather than repeating it as a field', () => {
    expect(puzzle).toContain('#   renderer: puzzle');
    expect(puzzle).not.toMatch(/^# renderer:/m);
  });

  it('marks itself generated and ends on a cursor', () => {
    expect(puzzle).toContain(`GENERATED by ${generatorPath}`);
    expect(puzzle.trimEnd().endsWith('<% tp.file.cursor() %>')).toBe(true);
  });

  it('omits the optional-fields block when a folder has none', () => {
    const bare = renderCardTemplate({ path: 'what/art', cascade: {} }, [fixtureFields[0]], {
      generatorPath,
    });
    expect(bare).not.toContain('Optional fields');
    expect(bare).not.toContain('Inherited from');
  });

  it('produces frontmatter that parses as YAML once Templater expands it', async () => {
    const schemaFields = parseSchemaFields(await readFile(SCHEMA_PATH, 'utf-8'));
    const template = renderCardTemplate(
      {
        path: 'what/puzzles',
        name: 'Puzzles',
        cascade: { renderer: 'puzzle', cardDescriptionParts: ['{{difficulty}}'] },
      },
      schemaFields,
      { generatorPath }
    );

    const expanded = template
      .replace('<% JSON.stringify(title) %>', JSON.stringify('A Card: "quoted" & odd'))
      .replace('<% tp.date.now("YYYY-MM-DD") %>', '2026-07-31');
    const frontmatter = parseYaml(expanded.split('---')[1]) as Record<string, unknown>;

    // Only the prefilled keys are live; every suggestion is a YAML comment, so a
    // freshly created card satisfies the content schema untouched.
    expect(Object.keys(frontmatter)).toEqual(['title', 'status', 'date', 'tags']);
    expect(frontmatter.title).toBe('A Card: "quoted" & odd');
    expect(frontmatter.status).toBe('draft');
    expect(frontmatter.tags).toEqual([]);
    expect(frontmatter.date).toBeInstanceOf(Date);
  });

  it('is deterministic — regenerating an unchanged folder rewrites the same text', () => {
    expect(
      renderCardTemplate(
        { path: 'what/puzzles', name: 'Puzzles', cascade: { renderer: 'puzzle' } },
        fixtureFields,
        { generatorPath }
      )
    ).toBe(puzzle);
  });
});
