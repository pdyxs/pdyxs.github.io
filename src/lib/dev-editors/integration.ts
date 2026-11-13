// The Astro integration. It does nothing unless the command is `dev`: no route
// is injected and no middleware mounted for `build`, so the production output
// cannot contain either. (A page under src/pages would ship; the pages live in
// src/dev-pages, which only this integration knows about.)
//
// The decision is `command === 'dev'`; the rest is the thin applier: an HTTP
// adapter from Vite's dev server onto createDevEditorsApi and the real fs.

import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createDevEditorsApi } from './api.ts';
import { createContentGit } from './git.ts';
import { DATA_CHANGED_EVENT, EDITORS_ROUTE, parseEditorPath } from './routes.ts';
import type { ApiResponse, ContentFs, EditorDefinition } from './types.ts';

export { DATA_CHANGED_EVENT, EDITORS_ROUTE };
/** Api prefix; the editor shell talks to `/__dev-editors/<id>/*`. */
export const EDITORS_API = '/__dev-editors';

function nodeFs(contentRoot: string): ContentFs {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)).map((f) => `${e.name}/${f}`) : [e.name],
    );
  return {
    read(file) {
      try {
        return readFileSync(file, 'utf8');
      } catch {
        return null;
      }
    },
    write(file, text) {
      mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, text);
      renameSync(tmp, file);
    },
    readBytes(file) {
      try {
        return readFileSync(file);
      } catch {
        return null;
      }
    },
    writeBytes(file, bytes) {
      mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, bytes);
      renameSync(tmp, file);
    },
    list: () => walk(contentRoot),
  };
}

async function readBody(req: AsyncIterable<Buffer | string>): Promise<unknown> {
  let text = '';
  for await (const chunk of req) text += chunk;
  return text ? JSON.parse(text) : undefined;
}

/** The card dir whose index.json `file` is, or null. Pure. */
export function cardDataDir(contentRoot: string, file: string): string | null {
  const rel = path.relative(contentRoot, file).split(path.sep).join('/');
  if (rel.startsWith('..') || path.isAbsolute(rel) || !rel.endsWith('/index.json')) return null;
  return rel.slice(0, -'/index.json'.length);
}

function apiPlugin(editors: readonly EditorDefinition<any>[]) {
  let contentRoot = '';
  return {
    name: 'pdyxs:dev-editors-api',
    apply: 'serve' as const,
    // A card's index.json is read by server-rendered code (a renderer's
    // import.meta.glob), and Astro answers any server-only module change by
    // reloading every open page — the editor included, mid-edit. So it is
    // handled here first: the stale server modules are invalidated as Astro
    // would, and the pages hear a custom event instead. Card pages reload on
    // it (dev-client.ts); editor pages, the ones saving, do not.
    hotUpdate: {
      order: 'pre' as const,
      handler(this: any, { file, modules, timestamp, server }: any) {
        const dir = contentRoot ? cardDataDir(contentRoot, file) : null;
        if (dir === null) return;
        const invalidated = new Set<any>();
        for (const mod of modules) this.environment.moduleGraph.invalidateModule(mod, invalidated, timestamp, true);
        const evaluated = this.environment.runner?.evaluatedModules;
        if (evaluated) {
          for (const mod of invalidated) {
            const ran = mod.id ? evaluated.getModuleById(mod.id) : undefined;
            if (ran) evaluated.invalidateModule(ran);
          }
        }
        if (this.environment.name === 'client') server.ws.send({ type: 'custom', event: DATA_CHANGED_EVENT, data: { dir } });
        return [];
      },
    },
    configureServer(server: any) {
      contentRoot = path.resolve(server.config.root, 'src', 'content');
      // A card in the path (`/dev/editors/<id>/<card dir>`) is served by the
      // editor's own page; the shell reads the card back out of the URL. Connect
      // strips the mount prefix from req.url and restores it on next().
      const ids = editors.map((e) => e.id);
      server.middlewares.use(EDITORS_ROUTE, (req: any, _res: any, next: () => void) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const parsed = parseEditorPath(EDITORS_ROUTE + url.pathname, ids);
        if (parsed && parsed.dir !== '') req.url = `/${parsed.editorId}${url.search}`;
        next();
      });
      const api = createDevEditorsApi({ editors, fs: nodeFs(contentRoot), git: createContentGit({ cwd: server.config.root }), contentRoot });
      server.middlewares.use(EDITORS_API, async (req: any, res: any) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        let out: ApiResponse;
        try {
          out = api.handle({
            method: req.method ?? 'GET',
            path: url.pathname,
            query: Object.fromEntries(url.searchParams),
            body: req.method === 'PUT' || req.method === 'POST' ? await readBody(req) : undefined,
          });
        } catch (err) {
          out = { status: 400, body: { error: err instanceof Error ? err.message : 'bad request' } };
        }
        res.statusCode = out.status;
        if (out.raw) {
          res.setHeader('content-type', out.raw.contentType);
          // An svg served same-origin can carry script; sandbox it so it only ever renders as an image.
          res.setHeader('content-security-policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'");
          res.setHeader('x-content-type-options', 'nosniff');
          res.setHeader('cache-control', 'no-cache');
          res.end(Buffer.from(out.raw.bytes));
          return;
        }
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(out.body));
      });
    },
  };
}

export function devEditors({ editors }: { editors: readonly EditorDefinition<any>[] }) {
  return {
    name: 'pdyxs:dev-editors',
    hooks: {
      'astro:config:setup': ({ command, injectRoute, updateConfig }: any) => {
        if (command !== 'dev') return;
        injectRoute({ pattern: EDITORS_ROUTE, entrypoint: './src/dev-pages/editors-index.astro' });
        // One concrete route per editor: a `[id]` param would need getStaticPaths.
        for (const { id } of editors) {
          injectRoute({ pattern: `${EDITORS_ROUTE}/${id}`, entrypoint: './src/dev-pages/editor.astro' });
        }
        updateConfig({ vite: { plugins: [apiPlugin(editors)] } });
      },
    },
  };
}
