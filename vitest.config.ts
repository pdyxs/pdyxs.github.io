/// <reference types="vitest/config" />
// Two projects, because one Vite config cannot be both (issue #95):
//
//   astro   — `.astro` container tests + pure `src/lib` tests, resolved through
//             Astro's Vite config in the "ssr" environment.
//   island  — Svelte client-mount tests (`*.island.test.ts`), resolved through a
//             plain Vite config so `mount()` has a lifecycle.
//
// `vitest run` runs both. Each config documents its own half.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['./vitest.astro.config.ts', './vitest.island.config.ts'],
  },
});
