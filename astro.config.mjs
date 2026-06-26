// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

// https://astro.build/config
export default defineConfig({
  site: 'https://pdyxs.wtf',
  integrations: [svelte()],
  vite: {
    server: {
      allowedHosts: ['preview.pdyxs.wtf'],
    },
  },
});
