# The content vault

`src/content` is its own Obsidian vault, separate from the main notes vault.

## Why a separate vault, not a mount

Obsidian settings are per-vault. Site content wants settings the notes vault
should never have — a pasted image belonging *in the card's own folder*, links
written as relative markdown rather than wikilinks. Content used to be exposed
to the notes vault through a bindfs mount (`Live/pdyxs.wtf/Content`), which
forced it to inherit that vault's global settings; that is what made the
"Obsidian image" problem unsolvable without a build-time wikilink converter.

A dedicated vault dissolves it. The mount was retired on 2026-07-21 — see
`~/server-project/docs/obsidian-live-mounts.md` → "Retired mounts". Content now
lives under exactly one settings context.

## Opening it

Obsidian → vault switcher → **Open folder as vault** →
`~/dev/pdyxs-astro/src/content`.

The committed `.obsidian/` is picked up on first open, so there is nothing to
configure by hand. Obsidian will prompt to trust the vault (Templater is a
community plugin) — accept, then enable Templater if it isn't already on.

## What's committed, and what isn't

| Path | |
|---|---|
| `.obsidian/app.json` | the settings that matter (below) |
| `.obsidian/core-plugins.json`, `community-plugins.json` | which plugins are on |
| `.obsidian/plugins/templater-obsidian/data.json` | Templater's template folder |
| `_templates/` | the card scaffolds (generated — issue #55) |
| `.obsidian/plugins/*/` (code) | **ignored** — install plugins per device |
| `.obsidian/workspace*.json`, `cache`, `.trash/` | **ignored** — per-device churn |

Plugin *code* is deliberately not vendored: it's ~1MB of JS that has no business
in a site repo, and Obsidian installs it per device in a couple of clicks.

The settings that carry the design:

- `attachmentFolderPath: "./"` — a pasted image lands in the card's folder,
  colocated and in-repo, where `resolveLocalImage()` and Astro's markdown image
  optimiser expect it.
- `useMarkdownLinks: true` + `newLinkFormat: "relative"` — images and links are
  inserted as plain markdown (`![](file.png)`), not `![[file.png]]` embeds, so
  no wikilink converter is needed and alt text is a first-class markdown `alt`.

### The `./`-prefix question, settled

Obsidian writes same-folder attachments as a **bare** path with URL-encoded
spaces — `![](Screenshot%20From%202026-07-19.png)`, no `./`. Existing content
uses `./`, so the open question was whether Astro's optimiser would reject the
bare form and need a normaliser.

It doesn't. Verified end to end on a real paste: dev serves
`/_image?href=…&f=webp` at the image's true dimensions, and `astro build`
emits the optimised variants (8kB png → 2kB webp). **No `./`-prefix normaliser
is needed**, and both forms work, so existing `./` content needs no migration.
- `sync: false` — this vault syncs by git, never by Obsidian Sync. Two sync
  layers over the same files is the failure mode the mount already demonstrated.

## `_templates/` is not content

Templater's template folder is `_templates` at the vault root. It sits inside
`src/content`, so the content collection's glob has to exclude it — that's
`CONTENT_GLOB_PATTERN` in `src/lib/content-glob.ts`:

```
["**/[!_]*.{md,mdx}", "!**/_*/**"]
```

The `[!_]` alone only guards a file's *own* name; without the second pattern,
`**/` walks straight into `_templates/` and every scaffold becomes a card.
`src/lib/content-glob.test.ts` pins this against the real glob engine.

Anything else that needs to live in the vault without being published goes in an
underscore-prefixed folder for the same reason.

## obsidian-git: desktop yes, mobile no

On desktop the plugin shells out to real `git`, which resolves the enclosing
repo from any subdirectory, so a vault at `src/content` syncs the whole
`pdyxs.github.io` working tree fine. Note what that means: **commit-and-sync
from the vault commits the entire repo, not just content** — if the working
tree has code changes in flight, they go in the "vault backup" commit too.

On mobile it does **not** work. That path runs isomorphic-git over an fs adapter
bound to the vault root (`getRepo()` → `dir: settings.basePath`), and `basePath`
can only point *down* into the vault, so a vault at `src/content` cannot reach a
repo root two levels above it. Resolving it means either a second vault rooted at
the repo root or bringing the deferred content-repo split forward — tracked
separately, not decided here.
