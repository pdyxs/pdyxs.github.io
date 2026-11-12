// The Astro integration. Does nothing unless the command is `dev`: no
// middleware is mounted for `build`, so the production output cannot contain
// the endpoint. A thin HTTP/fs adapter over createInspectHandler.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInspectHandler, type InspectFs } from './handler.ts';

export const INSPECT_ROUTE = '/__inspect';

const nodeFs: InspectFs = {
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
};

async function readBody(req: AsyncIterable<Buffer | string>): Promise<unknown> {
  let text = '';
  for await (const chunk of req) text += chunk;
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

function inspectPlugin() {
  return {
    name: 'pdyxs:dev-inspect',
    apply: 'serve' as const,
    configureServer(server: any) {
      const handle = createInspectHandler({ fs: nodeFs, root: path.resolve(server.config.root) });
      server.middlewares.use(INSPECT_ROUTE, async (req: any, res: any) => {
        const out = handle({ method: req.method ?? 'GET', body: await readBody(req) });
        res.statusCode = out.status;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(out.body));
      });
    },
  };
}

export function devInspect() {
  return {
    name: 'pdyxs:dev-inspect',
    hooks: {
      'astro:config:setup': ({ command, updateConfig }: any) => {
        if (command !== 'dev') return;
        updateConfig({ vite: { plugins: [inspectPlugin()] } });
      },
    },
  };
}
