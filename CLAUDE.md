# pdyxs.wtf — Astro rebuild

## Dev server

Runs as a user systemd service, `astro-preview.service`:

```
systemctl --user restart astro-preview.service
systemctl --user status  astro-preview.service --no-pager
```

Clearing `.astro` means restarting the service afterwards, so Astro rebuilds the
content database. Markdown and the content YAML hot-reload on their own
(`scripts/dev-reload-plugin.mjs`) — see [docs/agents/workflow.md](docs/agents/workflow.md)
for what still needs a manual `npm run generate:*`.

## Invariants that apply everywhere

Load-bearing. Violating one is a refactor, not a local change; each is stated in
full, with its reasoning, in the doc named beside it. Global architecture
principles (View→Logic one-way, events over direct calls, module independence,
pure decisions / thin effects, single source of truth) live in
`~/.claude/rules/architecture.md`; these are how they land here.

- **`CardStack.svelte` owns every card-stack mutation** — pushing, collapsing,
  reordering, hiding, scrolling, writing read state. Nothing else touches
  `#card-stack`. → [stack-state.md](docs/agents/stack-state.md)
- **Layout is reactive.** Mutate the store; `$derived`/`$effect` redraw. Never
  call the geometry from a handler. → [stack-layout.md](docs/agents/stack-layout.md)
- **Anything that can ship inside a card fragment is styled in `global.css`**,
  not a scoped `<style>` — and `cssCodeSplit: false` stays set in
  `astro.config.mjs`. → [styling.md](docs/agents/styling.md)
- **Every colour and spacing value is a `:root` custom property.** The palette
  is two colours; there is no grey, and an `opacity` used to soften a colour is
  a bug. → [styling.md](docs/agents/styling.md)
- **Never put `transform`, `filter`, `backdrop-filter`, `will-change`,
  `contain: paint` or `perspective` on an ancestor of a dithered element** — it
  re-anchors the fixed dither grid and the surface shimmers, silently.
  → [styling.md](docs/agents/styling.md)
- **CSS-first responsive.** Media queries decide layout; `matchMedia` is for
  interaction state only, and the two sanctioned escapes are named in
  [styling.md](docs/agents/styling.md).
- **A card's metadata is decided once, in `resolveCard()`.** Consumers take the
  result; they never re-derive one. → [content-model.md](docs/agents/content-model.md)
- **`data-uid` is `collection/id`** — the round-trip key between DOM and
  `/card/...`. Don't improvise it at a call site.
  → [stack-state.md](docs/agents/stack-state.md)
- **Body content links through `card:` / `collection:` / `tag:` protocols**,
  never an absolute or `/card/...` href. → [card-rendering.md](docs/agents/card-rendering.md)
- **A test that mounts a Svelte island is named `*.island.test.ts`.** That
  filename is what routes it to the vitest project where `mount()` works.
  → [testing.md](docs/agents/testing.md)
- **Any script, generator or agent that edits a card's frontmatter or body sets
  `inspected: false` on it**, in the same change.
  → [workflow.md](docs/agents/workflow.md)
- **A plan names the selectors and CSS variables it adds**, so reviewers see the
  contract without reading the diff. → [workflow.md](docs/agents/workflow.md)

## Reach for these

| when you're working on | read |
|---|---|
| the stack's state, entries, slots, `from`/`to` in the URL, fragments, read state, popstate, cold-load restore, Svelte islands, view transitions | [docs/agents/stack-state.md](docs/agents/stack-state.md) |
| how the stack is drawn or moves: fan geometry, piles, collapse/expand, the pre-paint skeleton, scrolling, reduced motion, the stable selector contract, the home slot grid | [docs/agents/stack-layout.md](docs/agents/stack-layout.md) |
| CSS: where a rule lives, theme switching, the dither, tokens, selected states, code blocks, breakpoints | [docs/agents/styling.md](docs/agents/styling.md) |
| cards, folder cascade, `_config.yaml`, priority, sort, tags, `excludeTags`, generators, affiliations, the `why` dimension, difficulty, redirects | [docs/agents/content-model.md](docs/agents/content-model.md) |
| lenses, the ranking chain, seen/unseen, home slots, the shared card pool, strip and history lenses, progressive reveal | [docs/agents/lenses-and-browse.md](docs/agents/lenses-and-browse.md) |
| a renderer, nav renderer, collection view, card credits (`meta:`), actions, galleries, the lightbox, video embeds, header-image padding | [docs/agents/card-rendering.md](docs/agents/card-rendering.md) |
| writing or running tests, the two vitest projects, happy-dom gaps | [docs/agents/testing.md](docs/agents/testing.md) |
| authoring content, the Obsidian vault, Templater scaffolds, `inspected`, dev hot-reload, experiment routes, plan docs | [docs/agents/workflow.md](docs/agents/workflow.md) |
| issues, triage labels, the glossary and decision records | [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md), [docs/agents/triage-labels.md](docs/agents/triage-labels.md), [docs/agents/domain.md](docs/agents/domain.md) |

The issue tracker is GitHub Issues on `pdyxs/pdyxs.github.io`, via `gh`. Domain
and design intent — glossary, `DEC-NNN` decisions, PRDs — live in the Obsidian
vault at `~/notes/Creativity/Projects/pdyxs.wtf/`, never in this repo.
