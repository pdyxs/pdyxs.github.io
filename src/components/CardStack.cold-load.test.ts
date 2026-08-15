// Cold-load read tracking (#92).
//
// Every other markRead call in CardStack.svelte hangs off a client-side
// navigation, so all the existing coverage exercises the push path — which is
// exactly why arriving straight at /card/... recording nothing went unnoticed.
//
// The decision itself (`readToRecord`) is covered in card-view-state.test.ts.
// What is left is the wiring: that the island's *mount* path applies it to the
// SSR-seeded location, and applies it to nothing else.
//
// It is asserted against the component source rather than by mounting the
// island, because mounting is not available here: vitest.config.ts wraps
// Astro's vite config, which resolves every import through the "ssr"
// environment (see src/test/vitest-env.ts and CLAUDE.md — .astro files need it),
// and under "ssr" Svelte resolves to its server build, where `mount()` throws
// lifecycle_function_unavailable. Neither a `@vitest-environment happy-dom`
// docblock nor `--environment happy-dom` changes that; the vite side is
// project-wide. Browser-verified instead, by cold-loading a /card/ URL and
// reading localStorage.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'CardStack.svelte'),
  'utf8',
);

/** The body of `onMount(() => { ... })`, up to its `initFromUrl()` call. */
function mountPathBeforeRestore(): string {
  const start = source.indexOf('onMount(() => {');
  expect(start).toBeGreaterThan(-1);
  const restore = source.indexOf('initFromUrl()', start);
  expect(restore).toBeGreaterThan(start);
  return source.slice(start, restore);
}

describe('cold load records read state', () => {
  it('marks the SSR-seeded location read on mount, before any navigation', () => {
    // A visitor arriving from search, a shared link, RSS or an old-URL redirect
    // never touches a push path, so the mount path is the only chance to record
    // the read. `readToRecord` is what narrows this to actual cards.
    expect(mountPathBeforeRestore()).toMatch(/markReadIfKnown\(activeUid\)/);
  });

  it('does not mark the from/to entries restored from a short code', () => {
    // Those arrive collapsed — shown, not opened — which is the same state the
    // front page's slots are in, and they are deliberately not reads. They are
    // restored by initFromUrl, so nothing in it may mark anything.
    const start = source.indexOf('async function initFromUrl()');
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf('\n  onMount(() => {', start);
    expect(end).toBeGreaterThan(start);
    expect(source.slice(start, end)).not.toMatch(/markRead/);
  });
});
