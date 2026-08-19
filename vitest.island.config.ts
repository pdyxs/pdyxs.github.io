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
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    // Svelte's client build, and the client build of everything it pulls in.
    conditions: ['browser'],
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
