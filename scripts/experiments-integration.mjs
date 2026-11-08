/**
 * Dev-only integration: serves the throwaway pages in src/experiments/ at
 * /experiments/<name>, plus an index at /experiments.
 *
 * They live outside src/pages/ because a file in pages/ is always built; an
 * injected route is only registered under `astro dev`, so nothing here reaches
 * a production build. The folder is scanned when the server starts, so a new
 * experiment needs a restart of astro-preview.service.
 */
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const EXPERIMENTS_DIR = new URL('../src/experiments/', import.meta.url);

/** The experiment slugs: every .astro file in the folder except the index. */
export function experimentSlugs(files) {
  return files
    .filter((f) => f.endsWith('.astro') && f !== 'index.astro')
    .map((f) => f.replace(/\.astro$/, ''))
    .sort();
}

export function experimentsIntegration() {
  return {
    name: 'dev-experiments',
    hooks: {
      'astro:config:setup': ({ command, injectRoute }) => {
        if (command !== 'dev') return;
        const dir = fileURLToPath(EXPERIMENTS_DIR);
        injectRoute({ pattern: '/experiments', entrypoint: `${dir}index.astro` });
        for (const slug of experimentSlugs(readdirSync(dir))) {
          injectRoute({ pattern: `/experiments/${slug}`, entrypoint: `${dir}${slug}.astro` });
        }
      },
    },
  };
}
