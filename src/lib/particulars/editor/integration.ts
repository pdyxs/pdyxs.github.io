// The only thing that makes the Particulars editor exist. It is an Astro
// integration that does nothing unless the command is `dev`: no route is
// injected and no endpoint is mounted for `build`, so the production output
// cannot contain either. (A page under src/pages would ship; a dev-only check
// inside such a page would still emit its HTML.)
//
// The decision is `command === 'dev'`; everything else here is the thin applier —
// an HTTP adapter from Vite's dev server onto createEditorApi and the real fs.

import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createEditorApi } from './api.ts';
import type { EditorFs } from './api.ts';

export const EDITOR_ROUTE = '/dev/particulars';
/** Endpoint prefix; the editor island talks to these. */
export const EDITOR_API = '/__particulars';

function nodeFs(contentRoot: string): EditorFs {
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
      // Atomic: a half-written index.json would make the site's build throw.
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, text);
      renameSync(tmp, file);
    },
    list: () => walk(contentRoot),
  };
}

async function readBody(req: AsyncIterable<Buffer | string>): Promise<any> {
  let text = '';
  for await (const chunk of req) text += chunk;
  return text ? JSON.parse(text) : {};
}

function editorServerPlugin() {
  return {
    name: 'pdyxs:particulars-editor',
    apply: 'serve' as const,
    configureServer(server: any) {
      const contentRoot = path.resolve(server.config.root, 'src', 'content');
      const api = createEditorApi({
        contentRoot,
        fs: nodeFs(contentRoot),
        today: () => new Date().toISOString().slice(0, 10),
      });
      server.middlewares.use(EDITOR_API, async (req: any, res: any) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        let out: { status: number; body: unknown };
        try {
          const rel = url.searchParams.get('path') ?? '';
          if (req.method === 'GET' && url.pathname === '/cards') out = api.cards();
          else if (req.method === 'GET' && url.pathname === '/scenario') out = api.read(rel);
          else if (req.method === 'PUT' && url.pathname === '/scenario') out = api.write(rel, await readBody(req));
          else if (req.method === 'POST' && url.pathname === '/create') {
            const body = await readBody(req);
            out = api.create(body.dir, body.title);
          } else out = { status: 404, body: { error: 'unknown endpoint' } };
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

export function particularsEditor() {
  return {
    name: 'pdyxs:particulars-editor',
    hooks: {
      'astro:config:setup': ({ command, injectRoute, updateConfig }: any) => {
        if (command !== 'dev') return;
        injectRoute({ pattern: EDITOR_ROUTE, entrypoint: './src/dev-pages/particulars-editor.astro' });
        updateConfig({ vite: { plugins: [editorServerPlugin()] } });
      },
    },
  };
}
