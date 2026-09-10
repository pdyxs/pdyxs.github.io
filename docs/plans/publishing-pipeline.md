# Publishing pipeline: preview, build, and `inspected` as a publish gate

Spec for wayfinder map
[Publishing pipeline: preview, build, and inspected as a publish gate](https://github.com/pdyxs/pdyxs.github.io/issues/157).
Every ruling below was decided on a ticket of that map; each section links the
ticket that holds the reasoning. **This document is the handoff — it says what to
build, not why every alternative lost.** Follow a link when you want the argument.

Nothing here is implemented yet. The three environments already exist (issue #91);
the branch topology, the two gates, the promotion workflow, the production
assertion and the rollback workflow are all to be built.

---

## 1. What this fixes

Three things Paul named as broken, and where each is answered:

| broken today | fixed by |
|---|---|
| Content for an unbuilt feature goes live early | `awaitsCode` (§4.2) — the card crosses *with* its code |
| A feature branch can't be looked at on real content | Preview and build serve the **working tree** (§2), so it is a `git checkout` |
| Obsidian-mobile auto-sync commits land on the deploy branch unreviewed | `dev` is not the deploy branch (§3) — pushing to it is no longer publishing |

## 2. The three environments

All three exist and are unchanged by this spec except for which branch production
builds. Built for issue #91; confirmed by
[Stand up preview.pdyxs.wtf on the tailnet](https://github.com/pdyxs/pdyxs.github.io/issues/167)
and [Stand up build.pdyxs.wtf](https://github.com/pdyxs/pdyxs.github.io/issues/168).

| | serves | build mode | dev-only features | content |
|---|---|---|---|---|
| `preview.pdyxs.wtf` | `astro dev` on :4321 | dev | **on** | working tree at `~/dev/pdyxs-astro`, uncommitted edits included |
| `build.pdyxs.wtf` | `npm run preview` on :4322 over a real `astro build` | production | **off** | the same working tree, rebuilt every 10 min |
| `pdyxs.wtf` | GitHub Pages | production | **off** | `main` — `inspected: true` files only |

- Units: `astro-preview.service`; `astro-build.timer` → `astro-build.service`
  (oneshot `npm run build`, stamps `dist/build-info.txt`) → `astro-build-preview.service`.
- `caddy.service` terminates TLS for `*.pdyxs.wtf` via the Cloudflare DNS challenge
  (`~/server-project/caddy/Caddyfile`).
- **Neither preview nor build tracks a branch.** There is no fetch, pull or deploy
  step in front of either; they serve whatever is checked out. That is deliberate —
  looking at a feature on real content is a `git checkout`, and *uncommitted* work is
  most of what preview is for.

**Build mode decides features; branch decides content**
([What 'dev-only features on' means for a deployed preview](https://github.com/pdyxs/pdyxs.github.io/issues/169)).
The two axes are orthogonal, so `isDev` and "is preview" are one concept and are
already correctly named — preview.pdyxs.wtf *is* the dev server. **No `PREVIEW=1`
flag, no renaming, no CI guard.** The capability such a flag would have bought
(seeing work-in-progress in a real production build) already exists as
`status: published` + `inspected: false`, because promotion is per-file on `inspected`.

**`build.pdyxs.wtf` is ungated by design.** It is a production-mode build of the dev
tree *including* uninspected content, because it is the only surface where an
uninspected card can be seen rendered in production mode — which is exactly how you
decide whether to tick it. Gating it would hide the content under review.

**Exposure posture: unchanged, and both hosts are already tailnet-only**
([Are preview and build allowed to be public?](https://github.com/pdyxs/pdyxs.github.io/issues/173)).
The DNS records are public but resolve into RFC 6598 CGNAT (Tailscale), grey-cloud,
no Funnel — the public internet cannot route to them. No auth (it would authenticate
an audience of one); records kept. One change, belt-and-braces against the A record
ever being repointed: `X-Robots-Tag` plus a `/robots.txt` `handle` block **in Caddy**,
never in the app — `public/robots.txt` would ship to production, and an `isDev` gate
would risk deindexing the live site to protect a host nobody can reach.

## 3. Branch topology

[Branch structure: where each environment builds from](https://github.com/pdyxs/pdyxs.github.io/issues/166).

- **`dev`** — the trunk. All code work happens directly on it; all content lands on
  it. Preview and build serve it (via the working tree). `pdyxs-content-git-sync`
  commits and **pushes** here every 15 minutes.
- **`main`** — what GitHub Pages builds. Nothing is authored on it; it receives
  promotion commits, plus hand-edits during a rollback (§7).
- **`master`** — frozen forever as the retired Jekyll site, because
  `generate-redirects` reads it at build time.

`astro-rebuild` renames to `dev`; `main` is created at that same commit, since that
commit is what is live right now.

**No feature branches**, normally — a branch is the escape hatch for shelving a
half-built idea. The accepted cost: **code promotion is all-or-nothing**, so `dev`'s
code must be shippable at the moment you promote, and a feature in flight blocks
promoting anything else. Known property, not a surprise.

**Auto-sync keeps pushing.** Under this topology pushing to `dev` is not publishing,
so the `CONTENT_SYNC_PUSH=0` opt-out is not wanted — losing the offsite copy would be
a regression bought for nothing.

## 4. The gates

### 4.1 `inspected` — the publish gate

`inspected` is promoted from an editorial flag to **the** publish gate. `inspected: true`
means "this may go live now"; `inspected: false` (or **absent** — see §6) withholds the
file from production and from nowhere else.

Three withholding mechanisms now coexist and they answer different questions
([What a production build does with inspected: false content](https://github.com/pdyxs/pdyxs.github.io/issues/165),
[#169](https://github.com/pdyxs/pdyxs.github.io/issues/169)):

| flag | withholds from | means |
|---|---|---|
| `inspected: false` | production only | changed without a human reading it |
| `status: draft` | production **and** `build.pdyxs.wtf` | genuinely unfinished |
| `status: scheduled` | until its publish date | timed |

They are orthogonal and compose; neither needs to know about the other, and no
reconciliation is needed. Consequence worth stating so a future session doesn't
misread it: this makes `status: draft` **much rarer in practice**, since most cards
move to `published` + `inspected: false` as soon as you want to look at them in a real
build. Low `draft` usage is *not* evidence the status is dead.

### 4.2 `awaitsCode` — choosing the trigger

[Is the feature gate the same mechanism as the content gate?](https://github.com/pdyxs/pdyxs.github.io/issues/170)

Content crosses daily; code crosses only when Paul says so. So `inspected: true` alone
cannot express "ready, but not before the code it needs". A second, orthogonal boolean does:

```yaml
inspected: true
awaitsCode: true      # promote me with the next CODE promotion, not the next content run
```

This is **not a second gate to coordinate** — it moves the card from the content
pathspec into the code one. Still one primitive (§5). A card needs **both**
`inspected: true` and (`awaitsCode` absent, or a code promotion happening) to cross.

- **Boolean, never `awaitsFeature: <name>`.** Code crosses all-or-nothing, so `main`
  only ever holds one code state; there is no reachable state where feature X has
  crossed and Y has not. **This stops being true the moment anyone reintroduces
  partial code promotion** — recorded here because nothing about the field's name
  would signal it.
- **It is consumed.** The promotion script removes `awaitsCode` from the card on `dev`
  in the same run that promotes it. Left set it lies, and every *future* edit to that
  card would silently wait for an arbitrary future code push. **The trap:** that clear
  is a machine edit to card frontmatter, so docs/agents/workflow.md's machine-edits-set-`inspected: false`
  rule would immediately withhold the card just promoted, forever. It needs the same
  explicit exemption `backfill-inspected.mjs` has (§9).
- **Frontmatter-only; it does not cascade**, like `headerMedia` — a hold belongs to a
  card, not to a folder shape.
- **Nothing reads it at render time.** Only the promotion script and the audit lens.
- Adding it means regenerating the Templater scaffolds (`npm run generate:card-templates`);
  the scaffolds are generated, never hand-edited.
- Worth an `awaiting-code` audit finding beside `not-inspected`, so a held card is
  visible on the worklist rather than only in the Actions log.

**Unknown frontmatter keys stay unguarded, deliberately.** Authoring ahead of a
feature via a key zod strips is a *supported pattern* — it is what makes the
[Collaborators](https://github.com/pdyxs/pdyxs.github.io/issues/156) data-authoring
safe to run in parallel with this map. No `.strict()` on the content schema. Inert
content is safe; a card that *depends* on such a key carries `awaitsCode` instead.

## 5. Promotion

A GitHub Actions workflow: `schedule` daily, plus `workflow_dispatch` with an input
for whether code crosses. Deploy already lives in Actions, so promotion and deploy are
one visible chain in the Actions tab. It is pure git with no local state — deliberately
**not** folded into `pdyxs-content-git-sync`, which is a job with a very different blast radius.

### The mechanism

The naive form — `git merge --no-commit dev`, then revert what must not cross — is
**wrong, and this is the load-bearing finding of the whole map.** A merge commit
advances the merge-base past every path it claims to have merged, so anything reverted
after the merge is, to git, already handled: the next three-way merge sees it unchanged
on `dev` since the new base and keeps `main`'s side. A card withheld once would stay
withheld **forever**, even after being ticked; a content-only promotion would silently
strand every code change on `dev` permanently.

So the merge's tree is never used:

```sh
git checkout main
git merge --no-commit --no-ff -s ours dev     # ancestry bookkeeping ONLY
```

`-s ours` records `dev` as a second parent while producing a tree identical to `main`'s.
No content is merged, so **no conflict is possible, ever**. Its only job is keeping
`git log main..dev` — "what has not been promoted" — honest.

The tree is then asserted from scratch, both halves through one primitive:

```sh
sync_paths() {                                 # $@ = pathspec
  git diff --name-status main dev -- "$@" | while read status path; do
    case $status in
      A|M) git checkout dev -- "$path" ;;
      D)   git rm -q -- "$path" ;;
    esac
  done
}

if [ "$PROMOTE_CODE" = 1 ]; then
  sync_paths ':!src/content' 'src/content/**/*.yaml' 'src/content/_templates' \
             $(cards_awaiting_code_on_dev)
  clear_awaits_code_on_dev                     # exempt from the inspected:false rule
fi
sync_paths $(inspected_cards_on_dev)           # minus those awaiting code
git commit
```

Three properties this buys:

- **Symmetric.** Code and content are the same primitive with different pathspecs —
  one mechanism to get right, not two that can disagree.
- **Nothing is inherited.** Every run states the tree from the current `inspected`
  flags and the current code decision, so an advanced merge-base can never withhold
  anything. A card ticked today crosses today, however many promotions withheld it before.
- **Deletions are handled.** A path-checkout loop is blind to a file removed on `dev`;
  `--name-status` is not. Without it, `main` keeps serving a card deleted months ago.
  The `A` case also covers a brand-new uninspected card, which has no `main` version to
  restore — withholding it is a delete-from-index, not a checkout.

### The code pathspec includes `src/content`'s structure files

`':!src/content'` alone would strand `src/content`'s 45 YAML files (`_config.yaml`,
`*.tag.yaml`, `*.lens.yaml`) and the 12 generated `_templates/` scaffolds in **neither**
pathspec — a new lens's YAML left behind the code that reads it, silently. They
**promote as code**: they have no `inspected` flag and never will (nobody reads a
`_config.yaml` end to end), they are structure edited in the repo rather than from
Obsidian mobile, and a lens YAML plus the registry generator that reads it are one change.

### Deletions cross immediately, ungated

A deleted card has no frontmatter for `inspected` to answer from, and the gate exists to
stop unfinished work being *published* — a deletion is the opposite act. The mass-deletion
rail lives one layer down, in `pdyxs-content-git-sync`.

### CI splits

- Push to `dev` — generators, tests, type-check, **no deploy**.
- Push to `main` — the assertion (§6), then build and deploy.
- The 18:00 UTC cron stays on `main`: a `scheduled` card crossing its publish date
  changes no git state, so it still needs a rebuild with no push behind it. Schedule
  the promotion workflow ahead of it so both land in one window.

`main`'s tree is `inspected: true` **by construction**, so the cron can never publish an
uninspected edit — that edit is simply not in the tree it rebuilds.

## 6. What a production build does with `inspected: false`

**It neither filters nor pins. It asserts.**
([What a production build does with inspected: false content](https://github.com/pdyxs/pdyxs.github.io/issues/165))

- The **pin is free** from the topology: a withheld edit never lands on `main`, so
  `main` keeps serving the card's last inspected version, with no per-card git
  archaeology inside the build.
- **Filtering is rejected**: excluding a card whose `inspected` is false would
  *unpublish* a live URL that RSS, search, social previews and the Jekyll redirect map
  all point at.

### The assertion

A **`main`-only CI step in `build.yml`, before the build**, scanning the whole tree and
failing if any card's `inspected` is not `true`.

- It **cannot unpublish anything**, because failing is not shipping. That is the whole
  reason it beats a filter.
- It covers every "reaches production anyway" route — a hotfix, a rebuild, a hand-merge —
  and the one that actually worries: **a bug in the promotion script**, which arrives
  through the front door.
- **Whole-tree, not diff-only.** `main` is `inspected: true` by construction, so a full
  scan should find nothing, and "found nothing" is the assertion worth making.
- **It must not live inside `astro build`**, which would fire on `build.pdyxs.wtf` — the
  one surface built to review uninspected content — and take the 10-minute rebuild timer
  down with it. The branch that carries the guarantee is the branch that asserts it.
- **No branch protection on `main`.** The assertion is the whole enforcement; protection
  is ceremony in a solo repo and would not catch the promotion-script bug anyway.

**Absent counts as not inspected**, mirroring `audit.ts`'s `not-inspected` detect and the
`why:uninspected` facet, so the site has **one definition of inspected** shared by the
audit lens, the facet and the gate. The population is fixed and small — the Templater
scaffolds now prefill `inspected: true` (commit `db9fd05`, guarded by
`templater-scaffold.test.ts`), so a missing key is a legacy-only condition going forward.

### Backstop: content that names code by name

The same `main`-only step carries the derived renderability check
([#170](https://github.com/pdyxs/pdyxs.github.io/issues/170)) — an unregistered
`renderer` / `navRenderer` / `headerMedia` / lens `component`. It is a **backstop, not the
primary mechanism**: a collaborators card renders *fine* against today's code (zod strips
the unknown key), so a renderability predicate would promote it happily and the harm is a
**wrong** card, not a broken one. The two fail in opposite directions, which is why the
authored flag is primary: `awaitsCode` fails **safe** (a card wrongly flagged ships one
promotion later); the predicate fails **open** (what it misses ships wrong).

### The silent fallbacks get made loud

Independent of the flag, and worth doing anyway, because the flag protects production
alone — `dev`, preview and build are all still silent today:

| surface | today | after |
|---|---|---|
| `headerMedia:` unregistered | plain `<img>`, silently | **build error** |
| lens `component:` unregistered | `DEFAULT_BODY_LOADER`, silently | **build error** |
| `renderer:` / `navRenderer:` unregistered | `GenericRenderer`, silently | **build error unless declared generic** |

`renderer` needs the extra clause because `post`, `story`, `card`, `puzzle` and `work`
reach `GenericRenderer` **on purpose** — so `renderers.ts` gains a declared
generic-fallback set beside `COLLECTION_RENDERERS`, and a value must be registered *or*
declared generic. `excludeTags`' `generatorDerivations()` is the existing precedent for
this shape. With these loud, the backstop reduces to "the `main` build passed", costing
no new CI.

## 7. Rollback

[Rollback: backing production out of a bad publish](https://github.com/pdyxs/pdyxs.github.io/issues/172)

**Two steps, both required:**

```
1. on main:  restore the card's last-good version   (or `git rm` it, if it is new)
2. on dev:   inspected: false
```

Each half is **silent on its own**, which is why this is scripted rather than documented:

- **Step 1 alone** is undone within ~24h — the card is still `inspected: true` on `dev`,
  so the daily diff shows `M` and it is re-promoted.
- **Step 2 alone** retracts nothing — an un-ticked card falls *out* of the pathspec,
  `sync_paths` never touches it, and it stays on `main` exactly as last promoted.
  **Freezing is not retracting**, and the flag reads as though it were.

So step 1 retracts, and step 2 stops the daily run from undoing step 1.

**Not "fix it at source and promote":** rollback's whole job is to stop the bleeding and
buy unlimited time to work out what the fix is. Requiring the fix to exist first defeats it.

**It does not violate the promotion design.** A withheld path sitting at whatever `main`
currently has *is* the regime promotion was designed for, and it heals automatically:
re-tick the card later and the diff shows `M` (or `A` for a new one) and restores it.
Nothing is permanent, nothing needs remembering. `main`'s history stays honest — a revert
commit is itself a publish event.

**Code rolls back the same way but has no step 2.** `git revert` on `main` is durable on
its own, because code is never in the daily pathspec. The asymmetry is **accepted, not
mechanised**: revert code today, promote code three weeks later from a `dev` that was
never fixed, and the bug returns silently. Mitigation is visibility — the promotion
workflow's dispatch prints `git log main..dev` for code, so a reverted commit sits in the
list of what is about to ship. Not a flag; a code promotion is already deliberate,
wholesale and human-triggered with a diff attached.

**Scripted as one `workflow_dispatch`** taking a card uid, doing both halves in one run,
and refusing if the card is not currently on `main`. It sets `inspected: false` on `dev`
as a machine edit — the one case where docs/agents/workflow.md's machine-edits rule **agrees** with
what is wanted rather than fighting it.

### Two verbs, and the test is where the state lives

- **Rollback** — "this went out wrong, undo it now." Leaves **no trace in content**: the
  card on `dev` is unchanged, only un-ticked. Urgent. The mechanism above.
- **Unpublish** — "this should no longer be live, as a decision." Is an **edit to the
  card** (`status: unlisted` to keep the URL alive and delist it, `archived` to 404 it,
  deletion when it should never have existed). Not urgent; goes through `dev` and a normal
  promotion.

Keeping these apart is how you avoid `status: unlisted` cards nobody can explain a year later.

### Not rollback levers

- **Re-running a previous successful Actions run** rebuilds from that commit's *source*
  (`npm run build`), rather than redeploying the bytes that were live; re-running `deploy`
  alone depends on the Pages artifact, whose retention is short and unconfigured here. It
  looks like a rollback lever and is not one — keep it out of the doctrine.
- **The Pages-source flip to `master`** is an **evacuation**, not a rollback: it serves the
  retired Jekyll site and takes the whole site back to pre-cutover. **Kept** — it is the
  only lever that works when Actions itself is broken — but `build.yml`'s comment is
  renamed accordingly. Its shelf life: it works only while `master` still holds a servable
  Jekyll site, which §3 freezes for an unrelated reason.

## 8. Implementation order

1. **Cutover the two legacy cards.** `what/stories/the-web/looking-greyscale` and
   `what/stories/the-web/the-advantages-of-truth` are missing the `inspected` key. Read and
   tick them. **No allowlist** — a grandfathering mechanism outlives its reason, and 2 is an
   afternoon. (An earlier count of 10 was wrong: the other 8 are in `src/content/.trash/`,
   untracked and excluded by `CONTENT_GLOB_PATTERN`.)
2. **Branch topology** — rename `astro-rebuild` → `dev`, create `main` at that commit,
   update `build.yml`'s `on.push.branches`, `CONTENT_SYNC_BRANCH`'s default (and
   `pdyxs-content-git-sync`'s on-branch guard), and GitHub's default-branch setting.
3. **Make the silent fallbacks loud** (§6) — independent of everything else, and it
   shortens the backstop.
4. **`awaitsCode`** — schema field, `npm run generate:card-templates`, audit finding.
5. **The promotion workflow** (§5).
6. **The `main`-only assertion step** in `build.yml` (§6), and split CI so `dev` tests
   without deploying.
7. **The rollback workflow** (§7), and rename the evacuation comment in `build.yml`.
8. **Caddy `X-Robots-Tag` + `/robots.txt`** for preview and build (§2).
9. **The agent docs** (§9).

## 9. What changes in the agent docs

`docs/agents/workflow.md`'s "`inspected` is a permanent editorial flag, not a pre-MVP
sweep" section (and the schema comment in `src/content.config.ts`) must be updated, because this map
changes what the flag *is* — a rule future sessions must not violate.

- **`inspected` is now a publish gate, not only an editorial flag.** `inspected: true`
  means "this may go live now". It has a fourth reader alongside `backfill-inspected.mjs`,
  the `not-inspected` audit finding and the `why:uninspected` facet: **the promotion
  script and the `main`-only CI assertion**.
- **One definition of inspected, and absent counts as not-inspected** — shared by the
  audit lens, the facet and the gate.
- **The machine-edits-set-`inspected: false` rule gains a second stated exception.**
  Today it exempts `backfill-inspected.mjs` and `content: auto-sync` commits. It must now
  also exempt **the promotion script's clearing of `awaitsCode`** — pipeline bookkeeping
  about a card, not a change to its content. Without the exemption, a promoted card
  withholds itself forever.
- **The rollback workflow is the one case where the rule agrees** with what is wanted:
  it sets `inspected: false` on `dev` deliberately.
- **`awaitsCode` gets documented** beside `inspected`: what it means, that it is
  frontmatter-only and does not cascade, that nothing reads it at render time, and that
  it is **consumed** by promotion.
- **The three withholding gates** (`inspected`, `status: draft`, `status: scheduled`)
  and their division of labour (§4.1), including the note that low `draft` usage is not
  evidence the status is dead.
- **The environments table** (§2) belongs in CLAUDE.md too — the existing "Dev Server"
  section documents `astro-preview.service` alone and says nothing about
  `build.pdyxs.wtf` or which branch production builds.

## 10. Still open

- **CI cost and cadence.** Building the same site up to three times — `dev` tests without
  deploying, `main` builds and deploys, plus the promotion run and the 18:00 cron — is not
  yet costed. Nor is `build.pdyxs.wtf`'s 10-minute timer, which pays a full build ~144×/day
  on the server regardless of whether anything changed. Left on the map's fog; it is a
  tuning question, not a blocker.
