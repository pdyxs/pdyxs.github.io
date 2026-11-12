// The editors' server side: plain requests in, `{ status, body }` out, file
// access through an injected `ContentFs`. The Vite middleware (integration.ts)
// only adapts HTTP and the real filesystem to this.

import { setInspectedFalse } from '../site/inspected-gate.ts';
import { resolveCardFile } from './paths.ts';
import { parseEnvelope, validateEnvelope, STARTING_VERSION } from './envelope.ts';
import type { ApiResponse, ContentFs, EditorDefinition, Envelope } from './types.ts';

export interface DevEditorsApiDeps {
  editors: readonly EditorDefinition<any>[];
  fs: ContentFs;
  contentRoot: string;
}

const json = (status: number, body: unknown): ApiResponse => ({ status, body });
const withMd = (indexJsonFile: string) => indexJsonFile.slice(0, -'index.json'.length) + 'index.md';
const asJson = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

export interface ApiRequest {
  method: string;
  /** Path below the api prefix, e.g. `/demo/cards`. */
  path: string;
  query?: Record<string, string>;
  body?: unknown;
}

export function createDevEditorsApi({ editors, fs, contentRoot }: DevEditorsApiDeps) {
  const find = (id: string) => editors.find((e) => e.id === id);

  /** The index.json beside a card, guarded. */
  const jsonTarget = (rel: string) => {
    const target = resolveCardFile(contentRoot, rel);
    if (target.ok && !target.file.endsWith('/index.json')) return { ok: false as const, error: 'only index.json may be read or saved' };
    return target;
  };

  const api = {
    editors(): ApiResponse {
      return json(200, editors.map(({ id, name, component }) => ({ id, name, component })));
    },

    cards(editorId: string): ApiResponse {
      const editor = find(editorId);
      if (!editor) return json(404, { error: `no editor "${editorId}"` });
      const dirs = fs
        .list()
        .filter((f) => f.endsWith('/index.json') && !f.split('/').some((s) => s.startsWith('_') || s.startsWith('.')))
        .map((f) => f.slice(0, -'/index.json'.length))
        .filter((dir) => {
          const target = jsonTarget(`${dir}/index.json`);
          const text = target.ok ? fs.read(target.file) : null;
          if (text === null) return false;
          const parsed = parseEnvelope(text);
          return parsed.ok && validateEnvelope(editor, parsed.envelope).length === 0;
        })
        .sort();
      return json(200, dirs.map((dir) => ({ dir })));
    },

    read(editorId: string, rel: string): ApiResponse {
      const editor = find(editorId);
      if (!editor) return json(404, { error: `no editor "${editorId}"` });
      const target = jsonTarget(rel);
      if (!target.ok) return json(400, { error: target.error });
      const text = fs.read(target.file);
      if (text === null) return json(404, { error: 'no index.json here yet' });
      const parsed = parseEnvelope(text);
      if (!parsed.ok) return json(422, { error: parsed.error });
      return json(200, parsed.envelope);
    },

    /** Save `body.data`; the plumbing owns `editor` and `version`. Also flags the card `inspected: false`. */
    write(editorId: string, rel: string, body: unknown): ApiResponse {
      const editor = find(editorId);
      if (!editor) return json(404, { error: `no editor "${editorId}"` });
      const target = jsonTarget(rel);
      if (!target.ok) return json(400, { error: target.error });
      if (typeof body !== 'object' || body === null || !('data' in body)) return json(400, { error: 'body must be { data }' });

      const mdFile = withMd(target.file);
      const md = fs.read(mdFile);
      if (md === null) return json(404, { error: 'no card (index.md) beside this index.json' });

      const existing = fs.read(target.file);
      const prior = existing === null ? null : parseEnvelope(existing);
      const priorVersion = prior?.ok ? (prior.envelope as Partial<Envelope>)?.version : undefined;
      const envelope: Envelope = {
        editor: editor.id,
        version: typeof priorVersion === 'string' ? priorVersion : STARTING_VERSION,
        data: (body as { data: unknown }).data,
      };
      const errors = validateEnvelope(editor, envelope);
      if (errors.length > 0) return json(400, { errors });

      fs.write(target.file, asJson(envelope));
      fs.write(mdFile, setInspectedFalse(md));
      return json(200, { ok: true });
    },
  };

  return {
    ...api,
    handle({ method, path, query = {}, body }: ApiRequest): ApiResponse {
      const [, id, action] = path.split('/');
      if (method === 'GET' && path === '/editors') return api.editors();
      if (method === 'GET' && action === 'cards') return api.cards(id);
      if (method === 'GET' && action === 'read') return api.read(id, query.path ?? '');
      if (method === 'PUT' && action === 'write') return api.write(id, query.path ?? '', body);
      return json(404, { error: 'unknown endpoint' });
    },
  };
}
