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

**Commands:** *Insert link (card, collection or tag)* searches everything at
once; there are scoped *Insert card / collection / tag link* commands too.
Bind whichever you use most to a hotkey. With text selected, the selection is
kept as the link label.

## What's in the picker

Nothing is generated or synced — the index is rebuilt from the vault whenever a
file changes, so a card you made a minute ago is linkable:

- **cards** — every folder holding an `index.md`. The uid is the folder path;
  the title is frontmatter `title`, which is all `resolveCardTitle` reads.
- **collections** — every folder whose `_config.yaml` declares a `name`.
- **tags** — every `*.tag.yaml`, plus every dimensioned tag actually in use
  (a card's frontmatter, or cascaded from a `_config.yaml`). Authored slash
  form is converted to canonical colon form, as `normaliseAuthoredTag` does.

The one gap: a value that exists **only** as a derived tag — the travel-log
`where:*`, the `when:*` eras, `what:puzzles/level-N` — is not in the vault, so
it appears only once some card authors it by hand. Those live in `src/data/`,
outside the vault root; reading them would mean node `fs` and a desktop-only
plugin, and this one works on mobile.

## Installing

The plugin is committed (a `.gitignore` exception — everything else under
`plugins/` is vendored code), so it arrives with a pull. Enable it once per
device: Settings → Community plugins → **pdyxs.wtf links**. No build step —
`main.js` is the source.
