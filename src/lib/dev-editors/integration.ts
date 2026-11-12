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
import type { ContentFs, EditorDefinition } from './types.ts';

export const EDITORS_ROUTE = '/dev/editors';
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
    list: () => walk(contentRoot),
  };
}

async function readBody(req: AsyncIterable<Buffer | string>): Promise<unknown> {
  let text = '';
  for await (const chunk of req) text += chunk;
  return text ? JSON.parse(text) : undefined;
}

function apiPlugin(editors: readonly EditorDefinition<any>[]) {
  return {
    name: 'pdyxs:dev-editors-api',
    apply: 'serve' as const,
    configureServer(server: any) {
      const contentRoot = path.resolve(server.config.root, 'src', 'content');
      const api = createDevEditorsApi({ editors, fs: nodeFs(contentRoot), git: createContentGit({ cwd: server.config.root }), contentRoot });
      server.middlewares.use(EDITORS_API, async (req: any, res: any) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        let out: { status: number; body: unknown };
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
