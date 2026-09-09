import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
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
// the full reasoning, and CLAUDE.md's "Anything that ships in a card
// fragment is styled in global.css" note for the wider pattern this closes a
// gap in.
describe('astro.config.mjs', () => {
  it('keeps Vite CSS code-splitting disabled', () => {
    const configPath = fileURLToPath(new URL('../astro.config.mjs', import.meta.url));
    const source = readFileSync(configPath, 'utf-8');
    expect(source).toMatch(/cssCodeSplit:\s*false/);
  });
});
