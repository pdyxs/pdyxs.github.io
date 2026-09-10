# Rendering a card: renderers, media, credits, links

## Nav renderer pattern (`NAV_RENDERERS`)

Collections that need custom navigation (e.g. prev/next chapter buttons, position indicators) register a nav renderer in `NAV_RENDERERS` (`src/lib/renderers.ts`). A nav renderer owns the full card shell — header and body structure — and receives the content renderer as `<slot />`. It is responsible for rendering `<CardHeader>` (or a custom header), the `.body-wrapper` / `.stack-card-body` structure, and any footer nav. Props passed by `card/[...path].astro`: `title`, `titleSuffix`, `entry`, `allEntries`.

A nav renderer is usually declared by the folder (`navRenderer: series` in a
`_config.yaml`), but `getSeriesSiblings` matches on the `series:` frontmatter
value alone — so a *subset* of a folder could be its own ordered run by
declaring `navRenderer`/`series`/`order` in frontmatter instead. Keep `series:`
values globally unique; they are matched across the whole collection, not
within a folder.

A series shows its whole run as a `CardStrip` — the same component as the
"Cards about this" section — rather than prev/next buttons. Two buttons can only
say what is immediately adjacent, which is the least interesting thing about a
series; the strip shows the run, where you are in it, and lets you jump
anywhere. The open card is in the strip, passed as `currentUid`: `BrowseCard`
renders it as a marked, non-navigating tile (`current`) and the strip opens
scrolled to it.

**The strip is not rendered by `SeriesNavRenderer`.** A nav renderer wraps the
content renderer as a slot, so anything it appends lands *below* the content
renderer's own "This is about" / "Cards about this" strips — three sections of
the same kind, with the most relevant one last. So `CardStackCard` resolves the
previews (`resolveSeriesCards`, `src/lib/series-cards.ts` — the IO shell around
the pure `getSeriesSiblings`) and passes them to the content renderer as
`seriesCards`; `GenericRenderer` renders "In this series" ahead of the other
two. The trigger is the card's `series:` frontmatter alone, not the nav renderer,
which is what lets a frontmatter-declared run get the strip. `SeriesNavRenderer`
is left owning just the header's `current/total` indicator.

Two traps that cost a round each:

- **The current tile is an inverted surface**, so it needs the mirror of *every*
  muted rule in `BrowseCard`, not just background and title. `--color-text-muted`
  is an alias of the ink — left alone, the date, the summary and the tag chips
  are ink on ink and simply vanish.
- **Open-on-current runs one frame late**, and re-measures first. The geometry
  it centres on is read from layout; measured in the same tick as mount, the
  flex children have no widths, the strip doesn't overflow, and the clamp in
  `scrollLeftForCard` correctly resolves that to "don't scroll". It also runs
  exactly once — a later resize must not yank the strip back after the reader
  has scrolled away.

## Collection view renderer pattern (`COLLECTION_VIEW_RENDERERS`)

Collection views are browsing cards for an entire collection — e.g. `/card/posts` lists all posts with tag filter chips. They use bare collection-name UIDs (`posts`, `projects`) with no id component, which is a deliberate exception to the `collection/id` invariant. Register them in `COLLECTION_VIEW_RENDERERS` (`src/lib/renderers.ts`). The renderer is a plain Astro component that fetches all cards server-side and passes them to `<CollectionBrowser client:load />`. To link to a collection view from card content, use `[text](collection:posts)` — `CardStack.onDocumentClick` handles the `collection:` protocol and pushes `/card/posts`.

## Card credits (`meta:`) are one flat shape, for Metadata Menu

A card's credit/fact rows ("Medium", "Technology", "Accolades", "Made with") are
an open-ended list, ported from the Jekyll site's `definitions:` — 22 distinct
labels across 25 cards, most used once, which is why they are a list and not
named schema fields.

The authored shape is **uniform and unconditional**, because `src/content` is an
Obsidian vault and this field is meant to be edited through a Metadata Menu
fileClass:

```
meta     Object List
├ label  Input
└ values Multi
```

Metadata Menu declares **one static shape per Object List item**. So two things
are banned in this schema, and both were tried and reverted:

- **No unions in `values`.** It is always `string[]`. A link is written as an
  ordinary markdown link inside the string —
  `"[Libby Heaney](http://libbyheaney.co.uk/)"` — which is the native Obsidian
  idiom. `parseMetaItem` (`src/lib/card-meta.ts`) unwraps a value that is
  *exactly* one link; a value that merely contains one stays literal text, so
  surrounding words can't be silently dropped.
- **No variant keys.** No `value`-vs-`values` pair where setting one implies the
  other is absent. Metadata Menu has no conditional fields, so it would render
  both as editable everywhere and guide authors no better than raw YAML.

`resolveMetaRows` (`src/lib/card-meta.ts`) is the single decision point: it folds
the named shorthands `when` / `medium` / `roles` / `puzzle_type` / `difficulty`
in at the front (a card must not express the same fact twice) and returns
display rows. `GenericRenderer` takes the result, and is the only renderer that
does — `WorkRenderer`, which kept its own `when`/`roles` `<dl>`, was deleted for
that reason (see the renderer-registry note below).

`difficulty` and `puzzle_type` stay named fields rather than authored `meta`
rows because `difficulty` feeds three renderings, not one.

## Action links are resolved, never read raw

`resolveActions` (`src/lib/card-actions.ts`) decides the masthead's "go do it"
links. Most cards author them as `actions:` rows; puzzles instead carry
`sudokupad_url` and `url` as named fields (both are load-bearing elsewhere), and
those fold in as *Play* and *LMD* the same way `medium` folds
into a meta row. `GenericRenderer` renders whatever comes back — it does not
filter, reorder, or reach for `data.actions` itself.

This fold is why there is no `PuzzleRenderer`. It was retired once its meta rows
and play link became ordinary folded fields: a puzzle is a `renderer: card` like
anything else, and `puzzle` now resolves to `GenericRenderer` by fallback.

`WorkRenderer` went the same way (issue #89), and **`COLLECTION_RENDERERS` is
now empty**. Registration is still mandatory — an unregistered name is not an
error, it is a silent fallback — but nothing has needed registering. The
cautionary tale is worth keeping: a dedicated renderer starts as "the two fields
this folder has extra" and then silently *lacks* everything `GenericRenderer`
grew afterwards. `WorkRenderer` rendered a header image, a `when`/`roles` `<dl>`
and the body, and that was all — so the six `where/work/*` cards had no tag
chips, no gallery and no "Cards about this", which was the only route from the
SeeThrough Studios card to the 25-card affiliation closure behind it. Nobody
noticed for as long as they did because the folder cascade was dead in
production (#88) and prod had been serving `GenericRenderer` all along.

Before adding a card renderer, fold the fields instead: a named frontmatter
field that folds into `resolveMetaRows` or `resolveActions` costs one line and
keeps the card in the one renderer everything else improves.

An action also carries a **`kind`** — `play` / `buy` / `read` / `source` /
`site` (`ACTION_KINDS`) — because 13 cards word their actions 16 different ways
and the `why:*` generators need intent, not prose. Two rulings hold the line: an
app-store or Steam link is `play`, since for software the store *is* how you get
to play it (which is why `buyable` is one card, not seven); and the folded
`sudokupad_url` is `play` while the LMD page is `site`. `kind` is optional —
an unkinded action renders normally and simply tells the generators nothing —
so a new action row that forgets it fails silently, in the direction of
under-tagging.

## Internal links in card content use a protocol, never an absolute URL

Body content links to the rest of the site through one of three protocols, all handled by `onDocumentClick` in `CardStack.svelte`. Each stays inside the card stack — an ordinary `https://pdyxs.wtf/...` or `/card/...` href is a full page load that discards the stack, and is treated as a data bug (guarded by `src/lib/content-links.test.ts`).

| protocol | pushes | example |
|---|---|---|
| `card:<uid>` | that single card | `[Numbeanies](card:what/games/digital/numbeanies)` |
| `collection:<dim>:<value>` | browse lens pre-filtered to that tag | `[Projects](collection:what:projects)` |
| `tag:<value>` | browse lens filtered to a tag value | `[Svalbard](tag:where:europe/norway/svalbard)` |

`<uid>` is the full dimension-rooted content path (`what/games/digital/numbeanies`), the same string as `data-uid`. Use `card:` for a single entry and `collection:` for a folder/series — a series folder has no card of its own, so `collection:what:posts/stories/arctic` is the only way to reach it.

## Video embeds are a bare link on its own line

YouTube and Vimeo embeds are never raw `<iframe>` — that's Jekyll-era markup the
audit lens flags as `legacy-markup`. Put the URL alone in its own paragraph and
`rehypeVideoEmbeds` (`src/lib/video-embeds.ts`) turns it into a responsive
`figure.video-embed`:

```
https://www.youtube.com/watch?v=u0nnn_4ZKGs
```

Only a paragraph containing *nothing but* the autolinked URL is rewritten, so a
video referenced mid-sentence, or a link with its own label, stays an ordinary
external link. `parseEmbedUrl` (`src/lib/embeds.ts`) is the single decision
point for what counts as an embed and accepts every shape the migrated content
carries (`/embed/<id>`, `watch?v=`, `youtu.be/`, `vimeo.com/<id>`,
`player.vimeo.com/video/<id>`).

The same parser handles embed URLs left in the legacy `images[]` frontmatter:
`resolveGalleryImages` resolves them to `kind: 'embed'` and `ImageGallery`
renders them as a **facade** — provider poster plus a play badge, with the
iframe only mounted once the lightbox opens, so no third-party player script
loads for a card nobody clicks.

Posters are asymmetric. YouTube has a predictable path (`i.ytimg.com/vi/<id>/mqdefault.jpg`
— `mqdefault`, since `hqdefault` letterboxes 16:9 into 4:3). Vimeo has none, so
`scripts/generate-vimeo-posters.mjs` resolves them via oEmbed into
`src/data/vimeo-posters.generated.ts` at predev/prebuild. That fetch is
incremental — an id already in the committed map is never re-fetched, so offline
builds are a no-op — and an unresolved id is reported in the generated file's
header and renders a labelled tile rather than a broken image.

**A header `image:` may be an embed URL too**, and the Jekyll content leaves
several that way. The masthead renders it as the *same* `.video-embed` figure
the body form emits — a live iframe, not the gallery's poster facade — because
a masthead is the card's primary media and `embedPosterUrl` only offers
`mqdefault` at 320×180, which is a thumbnail. `youtube-nocookie` is what makes
a live iframe acceptable: no cookies until playback. A header embed is
therefore **not** prepended to the gallery (the one exception to the
header-leads-the-gallery rule in `resolveGalleryImages`) — it is already
playable and fullscreen-capable where it sits, so a lightbox copy would only
show the same video twice.

The general rule underneath both: **a remote `image:` is not automatically an
`<img>`.** `GenericRenderer` resolves it three ways — `parseEmbedUrl`, then
`isRemoteVideoUrl`, then `isRemoteImageUrl` — and an unrecognised URL renders
*nothing*. It used to render any `http` string as an `<img>`, so an embed URL
(which serves an HTML page) painted a broken image with no error anywhere.

New CSS contract: `.video-embed`, `.generic-embed` (global.css). New tokens: none.

## A gallery never repeats what the body already shows

With no `images:` frontmatter, `resolveGalleryImages` (`src/lib/images.ts`)
sweeps the card's own folder — so a card whose prose walks through a worked
example image by image (the puzzle "Plans of a Medic") would show every one of
those images a second time as a gallery strip. The sweep therefore skips any
colocated file the body already links by name. An explicit `images[]` is never
filtered this way: naming a file there is a deliberate request to gallery it.

A folder can drop the strip entirely with `gallery: false` in its
`_config.yaml` (cascading nearest-wins like `renderer`, overridable per card in
frontmatter). `what/puzzles` does: a puzzle card *is* its grid image, which is
already the masthead, so the gallery had nothing to add.

## Header-image padding is authored, and the original is kept

Some source images are cropped flush to their content — every logic-masters
puzzle export sits at a 0–1% margin — and the full-bleed masthead then butts
that content against the card border. Whether that reads as damage or as a
deliberate frame depends on *what* is at the edge: Cityscrapers has unknown-clue
boxes outside the grid and looks clipped; a plain fog grid at the identical crop
looks intentional. No bounding-box heuristic separates those, so the amount is
authored per card and `npm run pad:images` applies it:

```yaml
image: bild.png
imagePad: 5%      # or 40px; a percentage resolves against the longer side
```

**The unpadded source is preserved at `<card>/_original/<file>` and every run
re-pads from it.** That is what makes the value adjustable: changing 5% to 8% is
a fresh pad of the original, never 8% added on top of 5%. Removing `imagePad`
(or setting it to `0`) restores the original — so backing a change out can't
strand a padded file with nothing in the frontmatter to explain it. An explicit
`0` is worth writing rather than deleting the key: it records "I looked at this
one and it needs nothing".

Decisions are pure in `src/lib/image-padding.ts`; `scripts/pad-card-images.mjs`
is the fs + sharp shell. The border colour is sampled from the original's own
four corners (`chooseBackground`), not hardcoded white — a dark or transparent
source would otherwise get a white frame that reads as damage.

Three things that bite:

- **It is deliberately not a `predev`/`prebuild` step.** Its output is committed
  image files and it only needs running when a value changes; wired into every
  dev boot it would rewrite assets on a machine that never touched them. Run it
  by hand, `--check` to preview.
- **Nothing reads `imagePad` at runtime.** It is in the schema for
  discoverability and Obsidian's Properties pane only. Zod *strips* unknown
  frontmatter keys rather than rejecting them, so a typo (`imagePadding:`) is
  silent — the script's run summary ("18 untouched") is the only signal, which
  is why it prints one.
- **`_original/` is under the card directory**, so every `startsWith(prefix)`
  sweep in `images.ts` would pick the unpadded source up and gallery it as a
  second, subtly different thumbnail. `isCardOwnAsset` (reusing
  `isVaultInfrastructurePath`) excludes it from both the gallery sweep and the
  audit lens's `localAssetFilenames`. Any new sweep over a card's colocated
  files must do the same.

`imagePad` is declared in the schema's `── puzzles ──` section although it works
on any card — the section is what keeps it out of every other folder's Templater
scaffold, and puzzles are the only folder that routinely needs it.

## One lightbox, two ways in

**Nothing `position: fixed` may live inside `.stack-card` and be visible at
desktop.** `#card-stack .stack-card` carries `clip-path: inset(0 0 0 0)` (the
identity crop the ahead fan animates from — see the geometry rules in [stack-layout.md](stack-layout.md), it cannot
go), and **a `clip-path` clips fixed-position descendants**. That is a separate
hazard from the containing-block one the dither rules in [styling.md](styling.md) warn about, and it
catches the opposite property: `clip-path` is safe for the dither and fatal
here. `.series-floating-btn` survives only because it is `display: none` at
that breakpoint.

`Lightbox.svelte` is `position: fixed` and mounts inside the card that owns the
images, so it was cropped to the active card's box — a "full-screen" viewer
that wasn't. It now moves itself out to `<body>` for as long as it is open
(the `portal` action in that component). Svelte's scoped-style classes are on
the nodes themselves so they survive the move, and every custom property it
reads is on `:root`.

`Lightbox.svelte` is the full-screen viewer — overlay, keyboard map, prev/next
wrap — and nothing else. Two callers decide what the set is:

- **`ImageGallery.svelte`** — the thumbnail strip, opening the gallery set.
- **`InlineImageViewer.svelte`** — the images a card's *body* renders inline.
  It has no UI at all: a delegated click listener plus a `<Lightbox>`. The set
  is every inline image in the card, in document order, so prev/next steps
  through a worked example rather than dead-ending on the one you clicked.

The listener binds to the enclosing `.stack-card-body-inner`, never `document`,
so a click in one card of the stack can't open another card's viewer.
`GenericRenderer` mounts the island only when `bodyHasInlineImage(entry.body)`
— most cards have none, and an island that can never fire is a download for
nothing.

Which images those are is one decision, `INLINE_BODY_IMAGE_SELECTOR`
(`src/lib/inline-images.ts`): `:is(p, li) > img`, since Astro's markdown wraps a
lone image in a paragraph. `global.css` writes the same selector out by hand
(CSS can't import it) to cap the height at `--inline-image-max-height` and set
the zoom cursor. **Change one, change both.**

The cap is `max-height` plus `object-fit: contain` — never `width: auto`. Astro
markdown images are `loading="lazy"` and carry width/height attributes, and
those attributes are what reserves the box before the file arrives; `width:
auto` discards them, an unloaded image has no intrinsic width, and the box
collapses to zero — so the image never intersects the viewport, never loads, and
the page jumps as each one finally pops in.

The header image is the exception to the no-repeats rule above — it always leads
the gallery, because the lightbox is the only way to see it full size.

