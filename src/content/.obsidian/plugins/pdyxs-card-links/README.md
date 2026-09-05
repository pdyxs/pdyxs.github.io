# pdyxs.wtf links

Inserts the three body-content link protocols the site understands, from a
picker built out of the vault itself:

| protocol | goes to | example |
|---|---|---|
| `card:<uid>` | that one card | `[Numbeanies](card:what/games/digital/numbeanies)` |
| `collection:<dim>:<value>` | the browse lens filtered to that folder | `[The Arctic Circle](collection:what:stories/arctic)` |
| `tag:<value>` | the browse lens filtered to that tag | `[Svalbard](tag:where:europe/norway/svalbard)` |

An ordinary `/card/...` or `https://pdyxs.wtf/...` href is a full page load that
discards the card stack, and is treated as a data bug — see
`src/lib/content-links.test.ts`.

## Using it

**Inline:** type `;;` and keep typing. The picker filters as you go; Enter
inserts the link with the card's own title as the label. Change or disable the
trigger in Settings → pdyxs.wtf links.

**Hotkey:** `Ctrl/Cmd + Shift + K` opens *Insert link (card, collection or
tag)*, which searches everything at once. The binding is committed in
`.obsidian/hotkeys.json`; change it in Settings → Hotkeys like any other.

**Commands:** the scoped *Insert card / collection / tag link* commands are in
the palette too, unbound. With text selected, the selection is kept as the link
label.

## What's in the picker

Nothing is generated or synced — the index is rebuilt from the vault whenever a
file changes, so a card you made a minute ago is linkable:

- **cards** — every folder holding an `index.md`. The uid is the folder path;
  the title is frontmatter `title`, which is all `resolveCardTitle` reads.
- **collections** — every folder whose `_config.yaml` declares a `name`.
- **tags** — every `*.tag.yaml`, plus every dimensioned tag actually in use
  (a card's frontmatter, or cascaded from a `_config.yaml`). Authored slash
  form is converted to canonical colon form, as `normaliseAuthoredTag` does.

On **desktop** it also reads the build-time tag manifest, which is where the
*derived* values live — travel-log `where:*`, the `when:*` eras,
`what:puzzles/level-N`. That takes the tag list from ~40 to ~520. It sits
outside the vault root (`../data/tag-manifest.json`, adjustable in settings),
so it needs node `fs`: on mobile the read is skipped and you get the vault half
only. Toggle it off in settings if you'd rather have the short list.

Two things about those entries, both of which follow from the manifest being a
build artifact:

- **They're only as fresh as the last `predev`/`prebuild`.** A value can be
  missing, or stale enough to link somewhere that no longer exists. Anything the
  vault knows wins the dedupe for that reason, and derived entries sort last and
  are marked `· derived` in the picker.
- **They carry no display name**, so each is named by humanising its own last
  segment — `Svalbard`, `Level 3`. A numeric segment keeps its whole path, since
  `03` on its own says nothing.

## Installing

The plugin is committed (a `.gitignore` exception — everything else under
`plugins/` is vendored code), so it arrives with a pull. Enable it once per
device: Settings → Community plugins → **pdyxs.wtf links**. No build step —
`main.js` is the source.
