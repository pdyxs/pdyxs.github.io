// The editors' server side: plain requests in, `{ status, body }` out, file
// access through an injected `ContentFs`. The Vite middleware (integration.ts)
// only adapts HTTP and the real filesystem to this.

import { FIVE_W_DIMENSIONS } from '../content/tags/five-w.ts';
import { setInspectedFalse } from '../site/inspected-gate.ts';
import { resolveCardFile } from './paths.ts';
import { parseEnvelope, validateEnvelope, newEnvelope, STARTING_VERSION } from './envelope.ts';
import { applyFrontmatterPlan, frontmatterPlan } from './frontmatter-plan.ts';
import { newCardFiles, selectorEntries, slugify } from './selector.ts';
import type { ApiResponse, ContentFs, EditorDefinition, Envelope } from './types.ts';

export interface DevEditorsApiDeps {
  editors: readonly EditorDefinition<any>[];
  fs: ContentFs;
  contentRoot: string;
  /** Today as `YYYY-MM-DD`; injected so the clock stays out of the logic. */
  today?: () => string;
}

const json = (status: number, body: unknown): ApiResponse => ({ status, body });
const withMd = (indexJsonFile: string) => indexJsonFile.slice(0, -'index.json'.length) + 'index.md';
const withJson = (indexMdFile: string) => indexMdFile.slice(0, -'index.md'.length) + 'index.json';
const asJson = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

export interface ApiRequest {
  method: string;
  /** Path below the api prefix, e.g. `/demo/cards`. */
  path: string;
  query?: Record<string, string>;
  body?: unknown;
}

export function createDevEditorsApi({ editors, fs, contentRoot, today = () => new Date().toISOString().slice(0, 10) }: DevEditorsApiDeps) {
  const find = (id: string) => editors.find((e) => e.id === id);

  /** The index.json beside a card, guarded. */
  const jsonTarget = (rel: string) => {
    const target = resolveCardFile(contentRoot, rel);
    if (target.ok && !target.file.endsWith('/index.json')) return { ok: false as const, error: 'only index.json may be read or saved' };
    return target;
  };

  /** Card folders (those with an index.md), outside hidden and underscore folders. */
  const cardDirs = () =>
    fs
      .list()
      .filter((f) => f.endsWith('/index.md') && !f.split('/').some((s) => s.startsWith('_') || s.startsWith('.')))
      .map((f) => f.slice(0, -'/index.md'.length))
      .sort();

  /** What a card's index.json is, as far as this editor is concerned. */
  const jsonState = (editor: EditorDefinition<any>, dir: string) => {
    const target = jsonTarget(`${dir}/index.json`);
    const text = target.ok ? fs.read(target.file) : null;
    if (text === null) return { kind: 'none' as const };
    const parsed = parseEnvelope(text);
    if (!parsed.ok) return { kind: 'broken' as const, description: 'an index.json that is not valid JSON' };
    if (validateEnvelope(editor, parsed.envelope).length === 0) return { kind: 'valid' as const };
    const owner = (parsed.envelope as { editor?: unknown } | null)?.editor;
    return typeof owner === 'string' && owner !== editor.id
      ? { kind: 'other' as const, description: `editor "${owner}"` }
      : { kind: 'broken' as const, description: 'an index.json whose data is invalid for this editor' };
  };

  const api = {
    editors(): ApiResponse {
      return json(200, editors.map(({ id, name, component }) => ({ id, name, component })));
    },

    /** Every card (a folder with an index.md), with whether its index.json is valid for the editor. */
    cards(editorId: string, { showAll = false }: { showAll?: boolean } = {}): ApiResponse {
      const editor = find(editorId);
      if (!editor) return json(404, { error: `no editor "${editorId}"` });
      const all = cardDirs().map((dir) => ({ dir, valid: jsonState(editor, dir).kind === 'valid' }));
      return json(200, selectorEntries(all, { showAll }));
    },

    /** Folders a new card may be created in: the dimension roots and every folder that already holds cards. */
    folders(): ApiResponse {
      const set = new Set<string>(FIVE_W_DIMENSIONS);
      for (const dir of cardDirs()) {
        const parts = dir.split('/');
        for (let n = 1; n < parts.length; n++) set.add(parts.slice(0, n).join('/'));
      }
      return json(200, [...set].sort());
    },

    /**
     * Makes a card renderable by this editor. A conflict (a different value in
     * the card's own frontmatter, or an index.json that is not this editor's)
     * answers 409 and writes nothing until the request carries `confirm`.
     */
    open(editorId: string, dir: string, body: unknown): ApiResponse {
      const editor = find(editorId);
      if (!editor) return json(404, { error: `no editor "${editorId}"` });
      const mdTarget = resolveCardFile(contentRoot, `${dir}/index.md`);
      if (!mdTarget.ok) return json(400, { error: mdTarget.error });
      const md = fs.read(mdTarget.file);
      if (md === null) return json(404, { error: 'no card (index.md) here' });
      const confirm = typeof body === 'object' && body !== null && (body as { confirm?: unknown }).confirm === true;

      const plan = frontmatterPlan(md, editor.frontmatter);
      const conflicts: { property: string; old: string; new: string }[] = Object.entries(plan).flatMap(([property, p]) =>
        p.kind === 'conflicts' ? [{ property, old: p.old, new: p.new }] : [],
      );
      const state = jsonState(editor, dir);
      if (state.kind === 'other' || state.kind === 'broken') conflicts.push({ property: 'index.json', old: state.description, new: `editor "${editor.id}"` });
      if (conflicts.length > 0 && !confirm) return json(409, { conflicts });

      const jsonFile = withJson(mdTarget.file);
      if (state.kind !== 'valid') fs.write(jsonFile, asJson(newEnvelope(editor)));
      const nextMd = applyFrontmatterPlan(md, editor.frontmatter, plan);
      if (nextMd !== md) fs.write(mdTarget.file, nextMd);
      return json(200, { ok: true, dir });
    },

    create(editorId: string, body: unknown): ApiResponse {
      const editor = find(editorId);
      if (!editor) return json(404, { error: `no editor "${editorId}"` });
      const { parent, title } = (typeof body === 'object' && body !== null ? body : {}) as { parent?: unknown; title?: unknown };
      if (typeof parent !== 'string' || typeof title !== 'string') return json(400, { error: 'body must be { parent, title }' });
      const slug = slugify(title);
      if (slug === '') return json(400, { error: 'title needs at least one letter or digit' });
      const dir = `${parent}/${slug}`;
      const mdTarget = resolveCardFile(contentRoot, `${dir}/index.md`);
      if (!mdTarget.ok) return json(400, { error: mdTarget.error });
      if (fs.read(mdTarget.file) !== null) return json(409, { error: `a card already exists at ${dir}` });
      const files = newCardFiles({ title: title.trim(), isoDate: today(), frontmatter: editor.frontmatter, envelope: newEnvelope(editor) });
      fs.write(withJson(mdTarget.file), files.indexJson);
      fs.write(mdTarget.file, files.indexMd);
      return json(200, { ok: true, dir });
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
      if (method === 'GET' && path === '/folders') return api.folders();
      if (method === 'GET' && action === 'cards') return api.cards(id, { showAll: query.all === '1' });
      if (method === 'POST' && action === 'open') return api.open(id, query.path ?? '', body);
      if (method === 'POST' && action === 'create') return api.create(id, body);
      if (method === 'GET' && action === 'read') return api.read(id, query.path ?? '');
      if (method === 'PUT' && action === 'write') return api.write(id, query.path ?? '', body);
      return json(404, { error: 'unknown endpoint' });
    },
  };
}
