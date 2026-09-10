/// <reference types="vitest/config" />
// The island project: client-side mount tests for Svelte components.
//
// Deliberately a PLAIN Vite config — no `getViteConfig`, no Astro plugin. That
// is the whole trick (issue #95): Astro's config forces the "ssr" Vite
// environment (see vitest.astro.config.ts), under which Svelte resolves to its
// server build and `mount()` throws `lifecycle_function_unavailable`. Without
// it, `@sveltejs/vite-plugin-svelte` plus the browser resolve condition gives
// the real client build, effects, lifecycle and event handlers included.
//
// The cost of the split is the rule: **a test in this project must not import
// a `.astro` file** — there is no Astro plugin here to transform one. Island
// components import only `.svelte` and `.ts`, so that holds today.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url));

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    // Svelte's client build, and the client build of everything it pulls in.
    conditions: ['browser'],
    // A PLAIN Vite config reads no `tsconfig.json` `compilerOptions.paths`, so
    // the aliases declared there have to be restated here by hand. Astro's own
    // Vite config (and therefore vitest.astro.config.ts) picks them up
    // natively; this project does not. Keep the two lists in sync — a missing
    // entry fails only in the island tests, and only for whichever module
    // happens to import through it.
    alias: {
      '@stack': src('lib/stack'),
      '@content': src('lib/content'),
      '@browse': src('lib/browse'),
      '@render': src('lib/render'),
      '@site': src('lib/site'),
      '@components': src('components'),
      '@stores': src('stores'),
      '@dimensions': src('dimensions'),
      '@data': src('data'),
    },
  },
  test: {
    name: 'island',
    environment: 'happy-dom',
    globals: true,
    include: ['src/**/*.island.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    passWithNoTests: true,
  },
});
