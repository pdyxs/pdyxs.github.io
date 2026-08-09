// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import { REDIRECTS } from './src/data/redirects.generated.ts';
import { rehypeExternalLinks } from './src/lib/external-links.ts';

// https://astro.build/config
export default defineConfig({
  site: 'https://pdyxs.wtf',
  integrations: [svelte()],
  // Old Jekyll permalinks (issue #70). The map is generated from the retired
  // site on `master` by scripts/generate-redirects.mjs (a prebuild step), never
  // hand-edited. In a static build Astro emits one meta-refresh HTML page per
  // entry, which is the only redirect mechanism GitHub Pages offers.
  redirects: REDIRECTS,
  markdown: {
    // Off-site links open in a new tab, decided in one place instead of the
    // per-link `{:target="_blank"}` annotations the Jekyll content carried.
    rehypePlugins: [rehypeExternalLinks],
  },
  vite: {
    server: {
      allowedHosts: ['preview.pdyxs.wtf'],
    },
  },
});
