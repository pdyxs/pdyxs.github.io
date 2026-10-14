import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Any stack location can be pushed onto, or arrive behind, any other, and a
// pushed/behind location's markup is injected as a fetched HTML fragment —
// never through the host page's own Astro render. Vite's default per-page CSS
// code-splitting links a Svelte island's scoped stylesheet only into the
// pages that render that island at build time, so an island only ever used
// from one page family shipped no CSS the moment its markup arrived via a
// fragment instead (ImageGallery pushed from a lens; the lens filter panel
// itself behind a cold-loaded card). `cssCodeSplit: false` in astro.config.mjs
// merges every page's CSS into one bundle every page links, making that bug
// class structurally impossible rather than something to keep auditing for.
// This is a source-text guard, not a build assertion, because the payoff only
// shows up in Rollup's chunk graph — see astro.config.mjs's own comment for
// the full reasoning, and docs/agents/styling.md's "A card fragment's CSS:
// scoped is fine, because cssCodeSplit: false" section for the wider pattern
// this closes a gap in.
describe('astro.config.mjs', () => {
  it('keeps Vite CSS code-splitting disabled', () => {
    const configPath = fileURLToPath(new URL('../astro.config.mjs', import.meta.url));
    const source = readFileSync(configPath, 'utf-8');
    expect(source).toMatch(/cssCodeSplit:\s*false/);
  });

  // Issue #188. A bare npm import that only an island reaches is invisible to
  // Vite's dev dependency scan (which crawls pages' server-side imports), so
  // dev discovers it lazily, in the browser, after the page has loaded. The
  // lazy re-optimise answers the island's import with 504 "Outdated Optimize
  // Dep"; the island never hydrates, and the SSR markup (the level furniture)
  // sits there inert, on first arrival and on refresh alike. `include` makes
  // dev pre-bundle it at startup. The sim is the one client-side code with such
  // an import (planck), so every bare package it imports must be listed.
  it('pre-bundles every npm package the Particulars sim imports client-side', () => {
    const configPath = fileURLToPath(new URL('../astro.config.mjs', import.meta.url));
    const source = readFileSync(configPath, 'utf-8');
    const simDir = new URL('./lib/particulars/sim/', import.meta.url);
    const packages = new Set<string>();
    for (const file of readdirSync(simDir)) {
      if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
      const text = readFileSync(new URL(file, simDir), 'utf-8');
      for (const m of text.matchAll(/from\s+'([^.'][^']*)'/g)) packages.add(m[1]);
    }
    expect([...packages]).toContain('planck');
    const include = source.match(/optimizeDeps:\s*{[^}]*include:\s*\[([^\]]*)\]/)?.[1] ?? '';
    for (const pkg of packages) expect(include, pkg).toContain(`'${pkg}'`);
  });
});
