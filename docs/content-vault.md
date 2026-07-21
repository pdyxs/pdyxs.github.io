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

Obsidian → vault switcher → **Open folder as vault** → the content directory.
On the server that's `~/dev/pdyxs-astro/src/content`; from the laptop it's the
SSHFS mount of that same directory (see *Editing from the laptop* below).

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

## Editing from the laptop: SSHFS, not sync

The vault is **not** copied to the laptop. The laptop mounts the server's
`src/content` over SSHFS and opens the mount as the vault:

```bash
sshfs server:/home/pdyxs/dev/pdyxs-astro/src/content ~/vaults/pdyxs-content \
  -o reconnect,ServerAliveInterval=15,ServerAliveCountMax=3,follow_symlinks
```

So a save *is* a write on the server. The dev server's watcher sees a real
filesystem event and hot-reloads — `preview.pdyxs.wtf` is current the moment the
file is saved, with no commit, push, pull, or polling in the path.

There is exactly one copy of the content and one `.obsidian`, which is the same
property the dedicated vault was chosen for, extended across machines.

Consequences worth knowing:

- **Editing requires connectivity.** No offline drafting; the mount is the vault.
- **Obsidian won't notice server-side changes.** inotify doesn't cross SSHFS, so
  if something else rewrites content underneath (a `git pull`, a script), reload
  the vault to see it.
- **`obsidian-git` cannot run in this vault** and is deliberately not enabled.
  The mount exposes `src/content` only; `.git` lives two levels above it and is
  a *worktree pointer file* besides. Git happens on the server — see below.

## Committing: server-side, content-scoped

`pdyxs-content-git-sync` (a 5-minute user timer, defined in `server-project`)
commits and pushes content edits from the server side.

It commits **only `src/content`**, via `git commit -- src/content`, which takes
the working-tree state of those paths and bypasses the index entirely. This
matters because the same checkout is where code work happens: anything staged
elsewhere stays staged and unshipped. It also refuses to act unless HEAD is
`astro-rebuild`, and skips while a merge/rebase/cherry-pick/revert is in flight.

This is the job `obsidian-git` would otherwise have done with a whole-repo
`git add -A` — which is precisely how in-flight code changes ended up inside a
"vault backup" commit before this existed.

## Mobile

Still unsolved, and SSHFS doesn't help — the same connectivity and `.git`-reach
problems apply, and `obsidian-git` on mobile runs isomorphic-git over an fs
adapter bound to the vault root (`getRepo()` → `dir: settings.basePath`), which
can only point *down*. Tracked separately.
