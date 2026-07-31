# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the
codebase.

## Before exploring, read these

All domain documentation lives in the Obsidian vault at
`~/notes/Creativity/Projects/pdyxs.wtf/`. There is no `CONTEXT.md` or `docs/adr/` in this repo,
and none should be created — the vault is the single source of truth.

- **`Glossary.md`** — settled terminology (card, lens, stack, location, tag registry…). This is
  the glossary; use its terms in issue titles, test names, and proposals.
- **`decisions/DEC-NNN-*.md`** — this project's ADRs. Read the ones touching your area before
  working in it. Cite them as `DEC-NNN`, not `ADR-NNNN`.
- **`Design.md`** — canonical design doc: design philosophy, Cards & Inquiry system, navigation
  model, front page. Open Questions live here under their own section.
- **`dev/prds/`, `dev/milestones/`, `dev/plans/`** — grilled PRDs, milestones, plans.

The repo's own `CLAUDE.md` covers *implementation* invariants (selector contracts, CSS tokens,
store ownership). The vault covers *domain and design* intent. Read both; they don't overlap.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a
test name), use the term as defined in `Glossary.md`. Don't drift to synonyms the glossary
explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing
language the project doesn't use (reconsider) or there's a real gap (note it for
`/domain-modeling`).

## New decisions go in the vault

`/domain-modeling` writes new decisions as `decisions/DEC-NNN-<slug>.md` in the vault, continuing
the existing numbering (currently DEC-007), and adds glossary terms to `Glossary.md`.

## Flag decision conflicts

Contradicting a settled decision must be surfaced, not silently overridden:

> _Contradicts DEC-004 (dimension-rooted content tree) — but worth reopening because…_

Decisions listed under **Don't Ask About** in the vault's `CLAUDE.md` are closed; don't re-raise
them.
