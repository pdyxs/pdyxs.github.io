# The content model: cards, cascade, tags

How a card is resolved and what decides its metadata. Renderers and card
chrome: [card-rendering.md](card-rendering.md). Lenses, ranking and browse:
[lenses-and-browse.md](lenses-and-browse.md).

## Card resolution happens once, in `resolveCard()`

`resolveCard(entry, cascade, ctx)` (`src/lib/cards.ts`) is the only place a card's
title, description, tags, renderer, nav renderer, status, visibility and content
hash are decided. It is pure and synchronous — the cascade is read by the caller,
and `isDev`/`now` arrive in `ctx` — so the whole sequence is unit-testable without
Astro. `getAllCards()` is the thin IO shell around it.

Consumers take the result; they never re-derive it. `CardStackCard.astro`
receives a `ResolvedCard` prop from its route's `getStaticPaths()` (which already
calls `getAllCards()`) and resolves nothing itself — enforced by a guard in
`CardStackCard.test.ts` that fails if the component references any resolution
primitive. The content hash in particular must be byte-identical to the pool's,
or client-side read tracking (`getViewState`, keyed on the hash) treats every
visit as changed content.

Two types, deliberately split:

- **`CardMeta`** — the listing subset every card has, including ones with no
  entry behind them (`collapse.ts` synthesises one per collapsed folder). This
  is what sitemap, RSS, front-page slots and the browse pool consume.
- **`ResolvedCard = CardMeta & { navRenderer?, titleSuffix?, width? }`** — adds
  the fields only a full card render needs. Kept off `CardMeta` because
  `CardMeta` crosses the wire to the browse client, where none of them mean
  anything.

To give the single-card view a new field, extend `ResolvedCard` — never resolve
it locally in the component.

## The client payload is an explicit pick, never a spread

`LensStackCard.astro` builds each `SerialisedCardFull` by listing its fields.
Spreading the card instead skips excess-property checking, so build-time-only
fields ship to the browser silently and every field later added to `CardMeta`
joins them. What crosses the wire is a decision.

## One description, one visibility predicate

Two discovery rules live in exactly one place each:

- **`resolveDescription` (`src/lib/description.ts`)** decides a card's one-line summary — hand-written `description` first, else a markdown-stripped, word-boundary-truncated body excerpt. `resolveCard()` runs it once and stores the result on `CardMeta.description`; OG/Twitter meta, JSON-LD, RSS and browse-card subtitles all read that field. Don't re-derive a summary at a call site.
- **`visibility.listed`** decides what is publicly advertised. `buildFeedItems` (`src/lib/rss.ts`) and `buildSitemapEntries` (`src/lib/sitemap.ts`) both filter on it; `src/lib/sitemap.test.ts` asserts they agree card-for-card against the shared fixtures in `src/test/card-fixtures.ts`. This is why `/sitemap.xml` is a hand-rolled route rather than `@astrojs/sitemap` — page enumeration would advertise `unlisted` cards, which are reachable by design.

Share metadata itself (canonical URL, OG/Twitter tag list, JSON-LD documents) is decided by pure functions in `src/lib/seo.ts`; `Base.astro` is the thin applier that emits them. `og:image` falls back to `DEFAULT_OG_IMAGE` (`public/og-default.png`, 1200×630) whenever a card has no usable header image.

## Content-relative paths resolve from the working directory, not the module

Anything that reads `src/content` at request time goes through
`assertContentRoot()` / `CONTENT_ROOT` (`src/lib/content-root.ts`) — never
`fileURLToPath(import.meta.url)`. The module's own location is not the project's:
`astro build` bundles these modules into the prerender output, where
`../content` resolves to `dist/.prerender/content`, which has never existed.
Both `_config.yaml` readers caught the ENOENT and returned null, so the whole
folder cascade silently yielded nothing in production while `astro dev` (running
from source) looked correct — issue #88, live for the entire life of the
cascade. `process.cwd()` is stable across all three contexts these modules run
in (`astro dev`, `astro build`, plain Node for `scripts/*.mjs` and vitest); an
Astro virtual module would only have fixed the middle one.

The second half of the rule is that it must fail *loudly*. A per-file
"no such file" is the normal case and has to stay cheap, which is exactly what
made a broken root indistinguishable from an empty tree. So the distinction is
drawn once, at reader construction: `assertContentRoot()` throws if the root is
missing or contains zero `_config.yaml` files. `src/lib/content-root.test.ts`
covers the real resolution and guards both readers' source against
`import.meta.url` coming back.

## Renderer registration is mandatory

Any new content collection must set its default renderer via `_config.yaml` in its content directory (resolved by `resolveFolderCascade` in `src/lib/folder-config.ts`, which walks every ancestor `_config.yaml` from the dimension root down — nearest wins); any new renderer component must be registered in `COLLECTION_RENDERERS` (`src/lib/renderers.ts`). Renderers must early-exit on missing `entry` and treat `Content` as optional — follow `GenericRenderer`'s shape.

Panel sections (`group:` on a container `_config.yaml`, ordered by the dimension
root's `groupOrder`) apply at **every** drill level, not just the root: drilling
into Puzzles shows the three `group: Series` folders, then a divider, then the
generated difficulty ratings. A level whose nodes are all ungrouped collapses to
one section and renders as a flat list, which is every other level on the site.

`width` and `gallery` cascade the same way (`_config.yaml` → `FolderCascade` → `ResolvedCard`, with a card's own frontmatter winning). Cards in a folder usually share a shape, and the shape is what sets the width: `what/puzzles` declares `520px` because a puzzle card *is* its square grid image, and at the site's 680px default that image dominates the viewport. Declare both per-folder, not per-card.

The applier is `applyMaxWidth` in `CardStack.svelte`, and it writes `--max-width` to **both** `<html>` and `#card-stack`. That is not redundant: the server renders `#card-stack` with the initial location's width inline so the first paint is right before hydration, and an inline style on `#card-stack` beats an inherited value from `<html>` for everything inside it. Writing only to `<html>` left a card pushed on top of a wide lens (browse is 960px) wearing the lens's width forever.

## `priority` is additive — and it is the only cascading *scalar* that is

Every other cascading scalar (`renderer`, `navRenderer`, `status`, `width`,
`gallery`, `dateLabel`, `sort`) is **nearest-wins**: the deepest declaration
replaces the ones above it. `priority` is the exception — a card's priority is
the **SUM** of every declaration that applies to it:

- its own frontmatter `priority`
- **every** ancestor folder's `_config.yaml` `priority` (not just the nearest)
- the `priority` on every `<value>.tag.yaml` for a tag it carries

(The two list-valued keys, `tags` and `excludeTags`, accumulate down the
cascade as well — but that is the ordinary behaviour for a list, not an
exception like this one. A folder's tags apply to its descendants *in addition
to* their own, and the same reasoning makes an exclusion accumulate.)

Negatives push a card down. Nothing about the word "priority" signals any of
this, which is why it is stated here, at the top of `src/lib/priority.ts`, and
in the schema comment in `src/content.config.ts` — three places, deliberately.
The magnitude convention (hundreds to move a folder as a block, ones to sort
within it) is the author's; the code enforces no scale.

**A folder counts once, as an ancestor** — never a second time as a filter
value. A card in `what/puzzles` carries `what:puzzles` as its path tag, so
without that rule a folder that both cascades a priority and declares one as a
tag would double it, and tuning becomes unpredictable exactly where you are
trying to tune. `tagPrioritySum` skips any tag naming one of the card's own
ancestors.

The decision is pure (`src/lib/priority.ts`); `resolveCard()` calls it and
stores one integer on `CardMeta.priority`. Affiliation tags land *after*
resolution (they are a fixed point over the whole pool), so `getAllCards()`
tops the sum up with whatever those tags declare rather than recomputing it.

Container `_config.yaml` priorities deliberately do **not** enter the
`.tag.yaml` priority map (`discoverTagPriorities`) — that is the same
counted-once rule, enforced at the source.

`imagePad`'s hazard applies here too: zod *strips* unknown frontmatter keys, so
`priorty: 100` would be silently ignored. `src/lib/priority-frontmatter.test.ts`
scans the raw markdown for near-misses and fails, because by the time content
reaches the audit lens the offending key is already gone.

## A folder's `sort` is a key *and* a direction

`sort: difficulty asc` in a `_config.yaml`, cascading nearest-wins like
`renderer`. Keys: `date`, `difficulty`, `order`, `title`; a bare key takes its
natural direction (`date` desc, the rest asc); the default is `date desc`;
**missing values sort last in both directions** — an unrated puzzle is not
"difficulty zero", and flipping the direction must not promote every card that
failed to say.

`resolveSortValue` resolves the folder's key into one comparable primitive at
build (`CardMeta.sort.value`), so the comparator never has to know what
`difficulty` means and the client payload carries one field instead of four.
`difficulty` is read by `parseDifficultyLevel` — this is that function's fourth
consumer, not a second parse. `what/puzzles` declares `difficulty asc`: a solver
picking a puzzle is choosing a difficulty, and its publication date says nothing.

## Tags are authored with `/`, canonical with `:`

`src/content` is an Obsidian vault and `tags` is one of Obsidian's reserved
frontmatter keys — it rejects `:` as an invalid tag name, which cost
autocomplete, the tag pane and tag search on every dimensioned tag. So content
is authored in Obsidian's **nested-tag form**:

```yaml
tags:
  - where/work/seethrough
  - when/released
```

`normaliseAuthoredTag` (`src/lib/five-w.ts`) rewrites the leading segment to the
canonical `where:work/seethrough` — which stays the form used **everywhere
downstream**: URLs, `src/data/*.generated.ts`, lens/tag YAML,
`stack-manifest.json` and every `indexOf(':')` split site. Conversion fires only
when the first `/`-segment is a known dimension and something follows it, so
dimensionless tags (`interactive`, and even the bare tag `why`) pass through
untouched, and the function is idempotent.

Four call sites, and they are the whole boundary:

- the `tags` field transform in `src/content.config.ts`
- the `_config.yaml` cascade in `resolveFolderCascade` (`src/lib/folder-config.ts`)
- `scripts/generate-stack-manifest.mjs`, which reads frontmatter through
  gray-matter and so never sees the schema transform
- `parseExcludeTags` (`src/lib/exclude-tags.ts`), for the value form of
  `excludeTags` — and it is the one call site that must **intercept before
  normalising**. `generated/location` is not a dimensioned tag, so
  `normaliseAuthoredTag` would pass it straight through as an ordinary
  dimensionless tag and the entry would silently become a veto of a tag value
  nothing has. `generated` is therefore a **reserved first segment**; the
  generator form is split off first, and only what remains is normalised.

**Anything else that reads raw frontmatter tags must normalise them itself** —
that includes tests that scan markdown directly (see
`project-status-vacate.test.ts`, which asserts against the authored form). Body
content is unaffected: the `card:` / `collection:` / `tag:` link protocols are
markdown link targets, not tags, and keep their colons.

A side benefit worth not undoing: without a colon, these values no longer need
YAML quoting.

## Canonical tag slugs in content; aliases only in tag YAML

Aliases in `src/content.config.ts` tag schema are a runtime safety net, not a feature to rely on. Content should always link to canonical slugs; aliased links in content are a data bug.

## `excludeTags` is the one way to say "not this tag"

**Derivation control is expressed entirely through `tags` and `excludeTags`.**
There are no per-generator knobs left: issue #116 folded five ad-hoc
suppression sentinels into this one field (`location: none`, `era: none`, and
`playable`/`viewable`/`buyable: never`), then retired the two *value* overrides
(`location:`, `era:`) that remained.

One field, two forms (`src/lib/exclude-tags.ts`).

**Retiring `location:`/`era:` came with a semantic shift worth stating.** Those
keys **replaced** a derivation; an authored tag **adds** to it. So a card that
belongs somewhere its date does not say now needs both halves:

```yaml
tags:
  - where/europe/norway/svalbard
excludeTags:
  - generated/location
```

Saying only the first leaves the card in two places at once — which for a post
written up a month after the trip is often exactly right, and is why the
addition is the default and the replacement is the thing you ask for. The two
story folders (`what/posts/stories/arctic`, `.../galapagos`) are the live
example, stating both at folder level.

```yaml
excludeTags:
  - why/playable          # this value, whoever proposed it
  - generated/location    # whatever the location derivation proposed
```

**The generator form is the robust one.** `generated/<derivation>` —
`location`, `era`, `difficulty`, `playable`, `buyable` — says "no location"
without needing to know what the travel log *currently* derives, so shifting a
date range can never silently un-suppress a card. It is keyed on the derivation
name rather than on the generator because `generated/why` would kill `playable`
and `buyable` together, and those are exactly the two facts a card is routinely
one of but not both. `generatorDerivations()` is the legal set, so a mistyped
entry is a **build error** — a suppression knob that fails open is invisible,
and the card simply keeps a tag nobody can see it was told to drop.

**The value form is the general one.** Anything else is a tag value,
prefix-matching on segment boundaries, so `where/europe` drops any European
derivation. It goes through `normaliseAuthoredTag` like any authored tag (the
fourth call site on that boundary — see above).

**The same namespace runs the other way in `tags`.** A folder excludes a
derivation for everything under it; one card takes that back:

```yaml
tags:
  - generated/location    # re-enable what the folder excluded
```

**Re-enable beats exclude, wherever each was declared** — the only rule that
makes the escape hatch work, since exclusions accumulate down the cascade and a
nearer-wins rule would leave a card unable to escape an inherited one. It is
resolved once, in `applyReEnables`, *before* any generator runs, so a re-enabled
derivation is simply not in `suppressed` and no generator has a second check to
sequence wrongly. A `generated/*` entry in `tags` is **stripped** once read
(`partitionGeneratedTags`): it is a directive, not a tag, and left in it would
reach the filter panel, the short-code manifest and the card's own rendered
chips as a value with no `.tag.yaml` behind it. `scripts/generate-stack-manifest.mjs`
reads raw frontmatter and so skips it itself.

Four things that bite:

- **A veto applies to the GENERATED DELTA, never to the tag list itself.**
  `generateTagsForCard` diffs what the generators added against what it was
  handed, and only the added tags are vetoable. So an authored tag — or a
  path-derived or cascade one — is unvetoable **by construction**: you write
  the tag or you write the veto, and the two can never contradict each other.
  This is also what preserves the older ruling that suppressing a derived
  `where:*` leaves an authored `where:work/*` in place; a generator declines
  its own derivation and never reaches the list it was given.
- **It ACCUMULATES down the cascade**, like `cascadeTags` and unlike the
  nearest-wins scalars beside it. That follows the list-valued precedent rather
  than breaking the nearest-wins rule: an exclusion is a statement about one
  tag, so a card naming its own has not thereby withdrawn its folder's.
  `what/puzzles/_config.yaml` excludes `generated/location` for all 20 puzzles,
  and a single puzzle adding an exclusion must not silently take that back.
  (`priority` is still the only additive *scalar*.)
- **There is no "force it on" counterpart, on purpose.** Authoring the tag is
  that: every generator dedupes against the tags it is handed, so
  `tags: [why/playable]` reaches the card first and the derivation agrees with
  it. This is why `viewable: always` became `tags: [why/viewable]` rather than
  a new positive field.
- **The value form can go stale silently**, which the generator form cannot —
  shift a travel-log range and `where/europe/norway` quietly catches nothing.
  `generateTagsForCard` already knows what was proposed, so an entry that
  removed nothing surfaces as the **`inert-derivation-control`** audit finding
  (same shape as `orphaned-old-url`). A re-enable with no exclusion to undo is
  reported by the same finding, for the same reason. That safety net is what
  makes the flexible form safe to offer. Note an entry matching only an
  *authored* tag counts as inert — it is: it removed nothing.

  **Only what a card's OWN frontmatter declares is reported.** A folder-level
  entry is routinely a no-op for some of its cards while being load-bearing for
  the rest, and the author cannot fix the one without breaking the other.
  `what/posts/stories/arctic` is the live case: it excludes `generated/location`
  and pins Svalbard, and for the 9 posts dated *inside* the Svalbard range the
  derivation would have produced that very tag — so the exclusion removes
  nothing there, while being the only thing keeping the 13 posts written up in
  August out of Quito and Peru. Judged per-card, that folder alone produced 9
  worklist entries with no available action. Whether a folder's entry is inert
  for *every* card under it is a different, pool-level question this per-card
  audit is not shaped to ask.

## The `why` dimension is affordances, and only two of five are derived

`why` is the one dimension with no cards under it: `src/content/why/` holds
declarations only, because "what this offers you" is a property of a card that
lives somewhere else. `why/_config.yaml` therefore declares **no `name`** — like
`what/_config.yaml` it is panel-only config, and a dimension root is not a
filter value, so an identity there would display nowhere while making
`generate-card-templates.mjs` emit a Templater scaffold for creating cards in a
folder that must never hold one.

Two of its five values are generated (`whyAffordanceGenerator`, decisions in
`src/lib/why-tags.ts`):

| value | predicate | suppress with |
|---|---|---|
| `why:playable` | any resolved action with `kind: play` | `excludeTags: [generated/playable]` |
| `why:buyable` | any resolved action with `kind: buy` | `excludeTags: [generated/buyable]` |

(And `tags: [generated/playable]` takes a folder's suppression back — see the
`excludeTags` section.)

**There is no "force it on" knob, because authoring the tag *is* one.**
`whyAffordanceGenerator` dedupes against the tags it is handed, so
`tags: [why/playable]` reaches the card before any generator runs and the
derivation simply agrees with it. That is what let issue #116 delete the
`always`/`never` trio outright.

The generator declares **two** derivation names rather than one `why`-shaped
one: the affordances are independent facts and a card is routinely playable but
not buyable, so `generated/playable` must leave `generated/buyable` alone —
which a generator-keyed `generated/why` could not express. This is exactly why
`FilterGenerator.derivations` is a list. See the `excludeTags` rules above.

**`why:viewable` is not derived at all (issue #96).** It used to be a header
`image` plus a markdown-stripped body under a length threshold — "does this
have a picture", which is a different question from "is this worth looking
at", and the two questions disagreed on most of the Instagram-era archive: the
mechanical version caught 133 cards, dominated by micro-posts, while missing
nothing about which ones were actually striking.

It then spent a while as a bespoke `viewable: always` frontmatter key, which
**issue #116 retired in turn**: an authored assertion that a card belongs in a
filter value is exactly what a tag is, and the two `learn/*` siblings were
already written that way. `tags: [why/viewable]` is now the only way in — pure
curation, uniform with the rest of the dimension. The consequence worth
knowing: `generated/viewable` is **not** a legal exclusion, and that falls out
of the key set rather than being special-cased. Nothing generates it, so there
is nothing to suppress.

The two `why:learn/*` values, `why:learn/gamedev` and
`why:learn/travel`, are **authored** the same way, and `why/learn/_config.yaml`
is load-bearing for exactly the reason the affiliation containers are:
`filterVisibleNodes` drops an undeclared node *and recurses into its
children*, so an undeclared container takes both perfectly-declared topics out
of the panel with no error anywhere.

## Affiliations are a pool-wide closure, not a filter generator

`who:*` values (the employers, plus `who:me`) are **affiliations**: a
`.tag.yaml` declares `seeds:` (content paths) and a card belongs to that value
if it is a seed, or if it tags a member — transitively.

```yaml
# src/content/who/seethrough.tag.yaml
name: SeeThrough Studios
seeds:
  - where/work/seethrough
```

That reaches the studio card, then the 20 cards tagging it, then 5 older posts
that name only *Particulars* and never named the studio. The transitive hop is
the entire point — it picks up content that predates the organisation's own
card. A seed may also name a **container** folder (`who/me` seeds
`where/contact`, which has no card): its children carry it as their path tag, so
the same edge rule reaches them with no special case. Folder descendants are
free for the same reason — `derivePathTags` already gives every card its parent.

**This is deliberately not a `FilterGenerator`.** A generator's
`apply(tags, card)` decides one card from its own date and overrides;
affiliation membership is a fixed point over every card's tags and can only be
decided once, over the pool. So it is a separate pass:

- `computeAffiliationTags` (`src/lib/affiliations.ts`) is the pure decision —
  BFS from the seeds over a reverse-tag index, `members` set per declaration so
  cycles terminate.
- `getAllCards()` runs it after every card has resolved and merges the result.
  `resolveCard()` stays per-card and pure. Membership is computed over the
  **whole** pool, hidden cards included — a draft is still a real link in the
  chain, and skipping it would silently sever the closure behind it.
- `discoverAffiliations` (`tag-registry.ts`) reads the seed lists, since
  `.tag.yaml` is already walked there. This is a second tree walk per
  `getAllCards()`; don't memoise it, or a dev-time YAML edit goes stale.

**A nested value needs its container declared.** `filterVisibleNodes`
(`browse-helpers.ts`) drops any node that isn't `declared` *and recurses into
children*, so an undeclared parent takes its perfectly-declared children down
with it — silently, with no error and a filter that simply isn't in the panel.
`buildTagHierarchy` synthesises the ancestor node for `who:collaborators/jetpack`,
but synthesised is not declared. Every nested value on the site therefore needs a
container `_config.yaml` (`who/collaborators/`, `who/employers/`, mirroring
`where/work/` and `what/puzzles/`). This bites hardest with affiliations, since
they're the one filter kind with no folder of content behind them to prompt you
to make one.

An affiliation value never appears in any markdown, so
`generate-stack-manifest.mjs` enumerates `.tag.yaml`-declared values explicitly
— without that they'd fall back to raw (long) URL encoding.

The trap this creates: an affiliation is named after the organisation, and every
card in the closure's *first* hop also carries the card-backed tag for that
organisation's own card, which resolves to the same name. Left alone Particulars
showed two chips both reading "SeeThrough Studios". `computeCardTagDisplay` takes
an optional `labelOf` and drops a chip whose label is already on the card;
earlier wins, so the authored card-linking tag survives. Cards deeper in the
closure have no twin and keep their affiliation chip, which is exactly where it
tells you something. Both chip call sites (`GenericRenderer`, `BrowseCard`) pass
`labelOf` — a new one that doesn't will reintroduce the duplicate.

## Difficulty is parsed once and rendered as stars

`src/lib/difficulty.ts` owns the whole of it. LMD rates a puzzle 1–5 and words
it "Level 3 (Medium)", which is what frontmatter carries — that string stays the
source of truth (it's what the LMD page says, and it round-trips on a re-rate),
but it isn't what a reader reads and it sorts alphabetically, which files Level 5
next to Level 1. So `parseDifficultyLevel` reads the rating out once and four
consumers render it:

- the card's credits row (`resolveMetaRows`) — `★★★☆☆`, with an `ariaLabel` so a
  screen reader says "Difficulty 3 out of 5" rather than five star characters
- `puzzleDifficultyGenerator` (`filter-generators.ts`) — the `what:puzzles/level-3`
  filter tag
- `generatedDisplayName` — that value's label in the panel, the same stars
- `resolveSortValue` (`folder-sort.ts`) — the value `what/puzzles`'s declared
  `sort: difficulty asc` orders its cards by (rung 5 of the ranking chain)

A string it can't read (`Fiendish`) falls back to its authored text and
generates no tag: better a card that says what was written than one that
invents a rating.

The generator is the only one that reads a *field* rather than a date, which it
does by declaring `difficulty` in `frontmatterKeys` — the existing frontmatter
?? cascade plumbing then hands it over, and no new channel is needed. Its values
are rooted at `what:puzzles` so they drill in under Puzzles beside the series;
only puzzles carry a `difficulty:`, which is what keeps that rooting honest.

**`difficulty:` is not an override, and that is why it survived issue #116.**
`location:` and `era:` were retired there because they existed only to redirect
a derivation — a job `tags` + `excludeTags` now does. `difficulty:` is authored
content with four consumers, one of which happens to be a generator; it merely
*looked* like an override because the generator borrowed that plumbing to read
it. The two roles are now separate fields on `FilterGenerator` —
`derivations` (the `generated/*` namespace) and `frontmatterKeys` (fields
read) — so the coincidence cannot re-form. Suppressing `generated/difficulty`
drops the **tag** and leaves the stars, the panel label and the folder sort
alone.

Puzzle listings therefore *don't* repeat the rating in their description —
`cardDescriptionParts` is `puzzle_type` alone, because the star chip is already
on every preview.

## A card never chips the whole it is a part of

Every card carries its parent folder's value as a path tag (`derivePathTags`),
and for nearly every folder that reads as a **category** — an art card chipped
"Art" is telling you something. A **collapsed** folder is not a category: it is
one work, and its cards are its chapters. So the chip said "In Fate's Hands" on
a chapter *of* In Fate's Hands, and its `tag:` link filtered to a lens holding
exactly one result — the collapsed representative, i.e. where the reader
already was. On the representative itself it was worse: the folder's identity
*is* that card's title, so the chip repeated it verbatim.

`FolderCascade.collapsedContainer` is the fact — the colon-form value of the
nearest ancestor declaring `collapse`, cascading nearest-wins like `renderer`.
It rides on **`CardMeta`**, not `ResolvedCard`, and crosses the wire on
`SerialisedCard`, because the chip rule it drives is the one rule shared by a
card's own masthead and every listing (`computeCardTagDisplay`'s
`selfContainer`). `collapseCollections` stamps the folder's own value onto the
representative it synthesises, which is what suppresses the self-titling chip
in listings.

**The panel says the same thing.** A collapsed folder is not offered as a place
to drill INTO — `NodeContext.excludedValues`, fed by `collapsedFolderValues`
(collapse.ts) at `LensStackCard`'s composition point, and honoured by
`extractDimensionTags`/`buildTagHierarchy`. So *Stories (3)* is a leaf with no
`›`, where it used to open onto three values that each listed the one
representative the reader could already see, under a heading duplicating that
card's own title. Two details:

- **BOTH sources have to be filtered.** The value is in `declaredValues` (the
  folder declares a `name:`) *and* on the representative's tags — and it has to
  stay on those tags, since that is what prefix-matches it into `what:stories`
  and gives the parent its count of 3.
- **Excluded means the subtree.** The predicate drops anything under an
  excluded value too, or a descendant would be silently reparented onto its
  grandparent; the same guard runs over the synthesised ancestors, which would
  otherwise reintroduce the node from below.

Three things worth knowing:

- **Only the chip is dropped.** The tag stays on the card, so filtering, the
  collapse tag union and the lens are untouched. This is a display rule, not a
  tagging one — which is also why `excludeTags` could not have expressed it: a
  veto applies to the generated delta, and a path tag is unvetoable by
  construction.
- **`collapse` is now read in two places, for two questions.**
  `collapse-config.ts` answers "which folders become one representative card"
  (the transform); the cascade answers "which whole am I a part of" (the card's
  own view of the relation). Neither is derivable from the other's output at
  the point it is needed.
- **The relation moved rather than vanished.** With the chip gone, a chapter
  titled "Themes" would otherwise say nothing about which story it belongs to,
  so the series presentation names it: `SeriesDotStrip`'s `label`, and the
  strip's `In this series` heading. It is **plain text, never a link** — the
  only target would be the one-result lens the chip already pointed at. The
  guard is `TagDisplay.declared`, not a truthy `name`: `displayFor` humanises
  the slug for an undeclared value, so an unnamed folder would head its own
  series "Fatecardgame".

New CSS contract: `.series-dot-label` (global.css). New tokens: none.

## Old-URL redirects are generated, never hand-edited

`src/data/redirects.generated.ts` is produced by `scripts/generate-redirects.mjs`
(a `predev`/`prebuild` step) from the retired Jekyll site on the `master` branch —
`_config.yml` for the permalink patterns, `collections/` for the inventory —
resolved against the current `src/content` tree. `astro.config.mjs` feeds the map
to Astro's `redirects`, which emits one meta-refresh page per entry in the static
build (GitHub Pages has no server-side redirects).

All resolution logic is pure and tested in `src/lib/redirect-map.ts`. Two rules
hold: every old URL gets a redirect (an unresolvable one falls back to the
closest lens rather than 404ing), and every fallback is reported — in
`UNRESOLVED_OLD_URLS`, in the generated file's header, and on stdout. If content
moves, re-run `npm run generate:redirects` and check the report.

A fallback caused by a card's **status** rather than by a missing card is
additionally attributed to that card in `ORPHANED_OLD_URLS`. `buildRedirectMap`
resolves twice for this — against the reachable uids (which the map is built
from, so it can never aim at a 404) and against every uid in the tree — and a
URL that fails the first but resolves in the second was orphaned by its own
card. The audit lens turns that into the `orphaned-old-url` finding, naming the
cards; publishing one restores its old URL and drops it off the list.

