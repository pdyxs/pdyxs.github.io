import { describe, it, expect } from 'vitest';
import { createDevEditorsApi } from './api.ts';
import type { ContentFs, EditorDefinition } from './types.ts';

const ROOT = '/c';
const demo: EditorDefinition<{ n: number }> = {
  id: 'demo',
  name: 'Demo',
  frontmatter: {},
  component: '',
  blank: () => ({ n: 0 }),
  validate: (d) => (typeof d?.n === 'number' ? [] : ['n must be a number']),
};

function fakeFs(files: Record<string, string>) {
  const writes: string[] = [];
  const fs: ContentFs = {
    read: (f) => files[f] ?? null,
    write: (f, t) => { files[f] = t; writes.push(f); },
    list: () => Object.keys(files).filter((f) => f.startsWith(ROOT + '/')).map((f) => f.slice(ROOT.length + 1)),
  };
  return { fs, files, writes };
}
const MD = '---\ntitle: "Demo" # keep\ninspected: true\n---\nbody\n';
const env = (n: unknown, version = '1.0.0', editor = 'demo') => JSON.stringify({ editor, version, data: { n } });

function setup(files: Record<string, string>) {
  const f = fakeFs({ ...files });
  return { ...f, api: createDevEditorsApi({ editors: [demo], fs: f.fs, contentRoot: ROOT }) };
}

describe('createDevEditorsApi', () => {
  it('lists only cards whose index.json is a valid envelope for the editor', () => {
    const { api } = setup({
      [`${ROOT}/what/a/index.md`]: MD, [`${ROOT}/what/a/index.json`]: env(1),
      [`${ROOT}/what/b/index.md`]: MD, [`${ROOT}/what/b/index.json`]: env('x'),
      [`${ROOT}/what/c/index.md`]: MD,
      [`${ROOT}/what/d/index.md`]: MD, [`${ROOT}/what/d/index.json`]: env(1, '1.0.0', 'other'),
      [`${ROOT}/what/e/index.md`]: MD, [`${ROOT}/what/e/index.json`]: '{bad',
    });
    expect(api.cards('demo')).toEqual({ status: 200, body: [{ dir: 'what/a' }] });
  });

  it('lists the registered editors', () => {
    expect(setup({}).api.editors()).toEqual({ status: 200, body: [{ id: 'demo', name: 'Demo', component: '' }] });
  });

  it('reads an envelope, 404s an unknown editor or missing file', () => {
    const { api } = setup({ [`${ROOT}/what/a/index.json`]: env(1) });
    expect(api.read('demo', 'what/a/index.json')).toEqual({ status: 200, body: { editor: 'demo', version: '1.0.0', data: { n: 1 } } });
    expect(api.read('nope', 'what/a/index.json').status).toBe(404);
    expect(api.read('demo', 'what/z/index.json').status).toBe(404);
  });

  it('save writes the envelope (keeping the version) and sets inspected: false textually in the same request', () => {
    const { api, files } = setup({
      [`${ROOT}/what/a/index.md`]: MD, [`${ROOT}/what/a/index.json`]: env(1, '1.2.0'),
    });
    expect(api.write('demo', 'what/a/index.json', { data: { n: 5 } })).toEqual({ status: 200, body: { ok: true } });
    expect(JSON.parse(files[`${ROOT}/what/a/index.json`])).toEqual({ editor: 'demo', version: '1.2.0', data: { n: 5 } });
    expect(files[`${ROOT}/what/a/index.md`]).toBe('---\ntitle: "Demo" # keep\ninspected: false\n---\nbody\n');
  });

  it('a new file starts at 1.0.0', () => {
    const { api, files } = setup({ [`${ROOT}/what/a/index.md`]: MD });
    expect(api.write('demo', 'what/a/index.json', { data: { n: 2 } }).status).toBe(200);
    expect(JSON.parse(files[`${ROOT}/what/a/index.json`]).version).toBe('1.0.0');
  });

  it('invalid data is a 400 and writes nothing', () => {
    const { api, writes } = setup({ [`${ROOT}/what/a/index.md`]: MD });
    const res = api.write('demo', 'what/a/index.json', { data: { n: 'x' } });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ errors: ['n must be a number'] });
    expect(writes).toEqual([]);
  });

  it.each(['../x/index.json', 'what/a/other.json', 'what/a/index.md', 'index.json', '/etc/index.json'])('a path like %j is a 400 and writes nothing', (p) => {
    const { api, writes } = setup({ [`${ROOT}/what/a/index.md`]: MD });
    expect(api.write('demo', p, { data: { n: 1 } }).status).toBe(400);
    expect(writes).toEqual([]);
  });

  it('refuses a save with no card (index.md) beside it, writing nothing', () => {
    const { api, writes } = setup({});
    expect(api.write('demo', 'what/a/index.json', { data: { n: 1 } }).status).toBe(404);
    expect(writes).toEqual([]);
  });

  it('refuses a body with no data member', () => {
    const { api, writes } = setup({ [`${ROOT}/what/a/index.md`]: MD });
    expect(api.write('demo', 'what/a/index.json', {}).status).toBe(400);
    expect(writes).toEqual([]);
  });

  it('routes requests by method and path under /<id>/', () => {
    const { api } = setup({ [`${ROOT}/what/a/index.md`]: MD, [`${ROOT}/what/a/index.json`]: env(1) });
    expect(api.handle({ method: 'GET', path: '/editors' }).status).toBe(200);
    expect(api.handle({ method: 'GET', path: '/demo/cards' }).body).toEqual([{ dir: 'what/a' }]);
    expect(api.handle({ method: 'GET', path: '/demo/read', query: { path: 'what/a/index.json' } }).status).toBe(200);
    expect(api.handle({ method: 'PUT', path: '/demo/write', query: { path: 'what/a/index.json' }, body: { data: { n: 3 } } }).status).toBe(200);
    expect(api.handle({ method: 'GET', path: '/demo/nope' }).status).toBe(404);
    expect(api.handle({ method: 'DELETE', path: '/demo/write' }).status).toBe(404);
  });
});
