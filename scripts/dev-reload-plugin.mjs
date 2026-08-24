/**
 * Dev-only Vite plugin: makes content YAML (and a couple of src/data/*.ts
 * inputs like travel-log.ts) hot-reload.
 *
 * The decision (which generator, whether to drop the route cache) lives in
 * src/lib/dev-reload.ts and is unit-tested there; this file is the thin effect —
 * watch, debounce, spawn, signal.
 *
 * Why an `astro:content-changed` ping rather than a plain module invalidation:
 * the YAML under src/content is read with node's fs, so it is in no module
 * graph, and invalidating the modules that read it isn't enough either. Astro's
 * dev server caches each route's getStaticPaths() result — which is where
 * getAllCards()/resolveCard() run — and that cache survives both a module
 * reload and a `server.restart()` (verified: only a full process restart or a
 * content-layer change cleared it). `astro:content-changed` is the event Astro's
 * own content plugin sends on a collection change, and its dev app entrypoint
 * responds by calling `pipeline.routeCache.clearAll()`. That is the lever a
 * markdown edit pulls, and the reason markdown already hot-reloads.
 *
 * travel-log.ts is a plain module (in the Vite module graph, unlike the YAML
 * above) so Vite already invalidates it on save — but that invalidation alone
 * doesn't touch the route cache either, and it also feeds
 * generate-stack-manifest.mjs's short-code enumeration, so it needs the same
 * regenerate-then-signal treatment as a `.tag.yaml` edit, not just a bare
 * `astro:content-changed`.
 *
 * Mirrors `invalidateDataStore` in
 * astro/dist/content/vite-plugin-content-virtual-mod.js — if a future Astro
 * upgrade renames that event, YAML goes back to needing a restart (and this
 * file is where to look).
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { planDevReload, mergePlans, GENERATOR_SCRIPTS } from '../src/lib/dev-reload.ts';

const DEBOUNCE_MS = 300;

function runGenerator(script, root) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { cwd: root, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code =>
      code === 0 ? resolve() : reject(new Error(`${script} exited with ${code}`)),
    );
  });
}

/** @returns {import('vite').Plugin} */
export function devReloadPlugin() {
  return {
    name: 'pdyxs:dev-reload',
    apply: 'serve',
    configureServer(server) {
      const root = server.config.root;
      /** @type {import('../src/lib/dev-reload.ts').ReloadPlan[]} */
      let pending = [];
      let timer = null;
      let running = false;

      const flush = async () => {
        timer = null;
        if (running) {
          // A refresh is already in flight; the next event reschedules.
          timer = setTimeout(flush, DEBOUNCE_MS);
          return;
        }
        const plan = mergePlans(pending);
        pending = [];
        if (plan.generators.length === 0 && !plan.refreshRoutes) return;

        running = true;
        try {
          for (const id of plan.generators) {
            await runGenerator(GENERATOR_SCRIPTS[id], root);
          }
          if (plan.refreshRoutes) {
            server.environments.ssr.hot.send('astro:content-changed', {});
            server.environments.client.hot.send({ type: 'full-reload', path: '*' });
            server.config.logger.info('[dev-reload] content config changed — route cache cleared');
          }
        } catch (err) {
          server.config.logger.error(`[dev-reload] ${err instanceof Error ? err.message : err}`);
        } finally {
          running = false;
        }
      };

      const onEvent = event => file => {
        const rel = path.relative(root, file).split(path.sep).join('/');
        const plan = planDevReload(rel, event);
        if (!plan) return;
        pending.push(plan);
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, DEBOUNCE_MS);
      };

      server.watcher.on('add', onEvent('add'));
      server.watcher.on('change', onEvent('change'));
      server.watcher.on('unlink', onEvent('unlink'));
    },
  };
}
