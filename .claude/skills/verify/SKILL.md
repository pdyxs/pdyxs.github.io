---
name: verify
description: Drive the running Astro dev server via Playwright MCP to observe a change end-to-end.
---

# Verifying pdyxs.wtf rebuild changes

## Launch

The dev server runs as a systemd user service, `astro-preview.service`, at
`http://localhost:4321/`. Restart it after any structural change (deleted/renamed/moved
files, new dependencies) so Vite's module graph and the content-collection cache are
rebuilt cleanly:

```bash
systemctl --user restart astro-preview.service
sleep 3
journalctl --user -u astro-preview.service -n 20 --no-pager   # confirm no startup errors
```

## Drive

Use the Playwright MCP tools (`mcp__playwright__browser_navigate`,
`browser_snapshot`, `browser_click`, `browser_console_messages`) directly against
`http://localhost:4321/...`. `browser_snapshot`'s `target` param takes an exact ref from
a prior snapshot (e.g. `f1e20`), not a CSS selector or free text — grab the ref first.

Always check `browser_console_messages` (level `warning`, `all: true`) after driving a
flow — zero errors/warnings is part of the pass bar, not optional.

## Gotcha: mixing full navigation with in-app clicks confuses history

This is a client-side-stack SPA (`CardStack.svelte` intercepts in-app link/button clicks
and manages its own virtual stack via `pushState`/`replaceState`). If you interleave
`browser_navigate` (a full page load) with in-app clicks in the same test session, the
browser's real history stack and the SPA's internal stack can diverge, and
`browser_navigate_back` may land somewhere unexpected (e.g. a snapshot missing chrome
that's actually present under normal use). This is a test-sequencing artifact, not a
product bug — reproduce suspicious back/forward behavior in an **isolated** sequence
(one `browser_navigate` cold load, then only in-app clicks, then `browser_navigate_back`)
before treating it as a finding.

## Gotcha: vitest content store needs a live `astro dev` pass

Unrelated to Playwright verification, but likely to bite in the same session: `npm test`
reads content collections from `node_modules/.astro/data-store.json`, which only gets
reliably populated by running `astro dev` (even briefly) — `astro build`/`astro sync`
alone can leave it empty in this environment, producing confusing "0 results" test
failures that look like real regressions. If `npm test` shows content-collection-shaped
failures after touching `.astro`/`node_modules/.astro`, restart `astro-preview.service`
(or briefly run `astro dev` and curl it) before trusting the test output.
