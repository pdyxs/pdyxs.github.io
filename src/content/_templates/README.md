# Templater templates

Card-scaffold templates for the content vault. Templater's template folder is
set to `_templates` (`.obsidian/plugins/templater-obsidian/data.json`).

`_templates` is excluded from the content collection because
`CONTENT_GLOB_PATTERN` (`src/lib/content-glob.ts`) only matches under the five
dimension roots, so nothing here can become a card.

## What's here

One template per **container folder** — every directory under `src/content`
whose `_config.yaml` declares a `name` (i.e. has a tag identity, so cards can be
filed under it). Files are named after the folder path with `/` replaced by `-`,
e.g. `what/stories/arctic` → `what-stories-arctic.md`.

Running one in Obsidian:

1. prompts for a card title,
2. slugifies it and moves the new note to `<folder>/<slug>/index.md` — a card is
   a folder with an `index.md` (DEC-005),
3. writes frontmatter prefilled with the title, `status: draft`, today's `date`
   and an empty `tags` list,
4. lists that folder's other schema fields **as YAML comments** underneath, so
   the card already passes the content schema before you uncomment anything,
5. notes the values the folder's `_config.yaml` cascade already supplies
   (`renderer`, `navRenderer`, `location`, `era`) so you don't repeat them, and
6. leaves the cursor in the body.

## Regenerating

These files are **generated, not hand-edited**. Anything typed into one is lost
on the next regen.

```bash
npm run generate:card-templates
```

It also runs automatically as part of `npm run dev` and `npm run build` (via the
`predev`/`prebuild` lifecycle scripts), alongside the lens and stack-manifest
generators.

Re-run it after any change to the folder tree — a new container folder, a
renamed one, a `_config.yaml` gaining or losing `name`/`renderer`/`location`, or
a new field on the content schema. The generator deletes every `.md` in this
folder except this README before writing, so a removed folder leaves no stale
template behind. Output is deterministic: regenerating an unchanged tree
produces no diff.

## How they're derived

- Generator (thin applier, filesystem I/O): `scripts/generate-card-templates.mjs`
- Decisions (pure, unit-tested): `src/lib/templater-scaffold.ts` +
  `src/lib/templater-scaffold.test.ts`
- Folder config is read through `resolveFolderCascade`
  (`src/lib/folder-config.ts`), the same cascade the site itself uses.

The suggested field list comes from the content schema
(`src/content.config.ts`) alone: every template offers the `common` fields, and
a folder additionally picks up a schema section when one of its path segments
names it — `what/puzzles` → the `// ── puzzles ──` fields, `where/work` → the
`work` fields, `what/stories/*` → the `stories` fields.
Fields referenced by a folder's cascaded `cardDescriptionParts` are always
included.

There is deliberately **no per-renderer field-set registry** (issue #55, option
(a)): nothing in `renderers.ts` declares which frontmatter fields a renderer
consumes, and inventing that registration surface for the two special renderers
(`puzzle`, `work`) wasn't worth its cost. It can be layered on later without
invalidating any of the above.
