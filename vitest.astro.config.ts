/// <reference types="vitest/config" />
// The Astro project: everything that imports a `.astro` file, plus every pure
// `src/lib` test. Resolved through Astro's own Vite config, which is what makes
// `experimental_AstroContainer` work — and, via `src/test/vitest-env.ts`, forces
// `viteEnvironment: "ssr"` so `.astro` imports return real SSR component
// factories instead of browser stubs.
//
// The same "ssr" resolution makes Svelte resolve to its *server* build, which
// has no client lifecycle — so `mount()` cannot run here. Island mount tests
// live in the sibling `island` project (vitest.island.config.ts) and are
// excluded below by filename.
import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: {
    name: 'astro',
    environment: './src/test/vitest-env.ts',
    globals: true,
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'src/**/*.island.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    passWithNoTests: true,
  },
});
