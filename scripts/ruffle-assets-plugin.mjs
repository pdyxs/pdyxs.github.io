// Serves @ruffle-rs/ruffle's runtime files (its lazily-loaded core chunks and
// .wasm) from the site itself at /ruffle/. Ruffle fetches them at run time
// relative to its `publicPath` config (set in src/lib/flash/ruffle-loader.ts),
// so they have to exist as real URLs; bundling ruffle.js alone is not enough.
// Dev: middleware straight from node_modules. Build: emitted into dist/ruffle/.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';

const PREFIX = '/ruffle/';

function ruffleDir() {
  const require = createRequire(import.meta.url);
  return dirname(require.resolve('@ruffle-rs/ruffle/package.json'));
}

// Runtime files only: chunks and wasm, not the entry (which Vite bundles), maps or docs.
const isRuntimeFile = (name) => /\.(wasm|js)$/.test(name) && name !== 'ruffle.js';

export function ruffleAssetsPlugin() {
  return {
    name: 'ruffle-assets',
    configureServer(server) {
      const dir = ruffleDir();
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (!url.startsWith(PREFIX)) return next();
        const name = url.slice(PREFIX.length);
        const file = join(dir, name);
        if (name.includes('/') || !isRuntimeFile(name) || !existsSync(file)) return next();
        res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      // Astro also runs a server-side build; emitting there would collide when it moves assets.
      if (this.environment?.name !== 'client') return;
      const dir = ruffleDir();
      for (const name of readdirSync(dir).filter(isRuntimeFile)) {
        this.emitFile({ type: 'asset', fileName: `ruffle/${name}`, source: readFileSync(join(dir, name)) });
      }
    },
  };
}
