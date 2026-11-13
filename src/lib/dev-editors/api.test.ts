import { describe, it, expect } from 'vitest';
import { createDevEditorsApi } from './api.ts';
import type { ContentFs, ContentGit, EditorDefinition } from './types.ts';

const ROOT = '/c';
const demo: EditorDefinition<{ n: number }> = {
  id: 'demo',
  name: 'Demo',
  frontmatter: { headerMedia: 'demo' },
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
const MD = '---\ntitle: "Demo" # keep\ninspected: true\nheaderMedia: demo\n---\nbody\n';
const env = (n: unknown, version = '1.0.0', editor = 'demo') => JSON.stringify({ editor, version, data: { n } });

function setup(files: Record<string, string>) {
  const f = fakeFs({ ...files });
  return { ...f, api: createDevEditorsApi({ editors: [demo], fs: f.fs, contentRoot: ROOT }) };
}

describe('createDevEditorsApi', () => {
  it('a save leaves an index.md that is already inspected: false untouched, so the page is not reloaded', () => {
    const md = MD.replace('inspected: true', 'inspected: false');
    const { api, writes } = setup({ [`${ROOT}/what/a/index.md`]: md, [`${ROOT}/what/a/index.json`]: env(1) });
    api.write('demo', 'what/a/index.json', { data: { n: 2 } });
    expect(writes).toEqual([`${ROOT}/what/a/index.json`]);
  });

  it('names the registered editor a card belongs to, else null', () => {
    const { api } = setup({
      [`${ROOT}/what/a/index.md`]: MD, [`${ROOT}/what/a/index.json`]: env(1),
      [`${ROOT}/what/d/index.md`]: MD, [`${ROOT}/what/d/index.json`]: env(1, '1.0.0', 'other'),
      [`${ROOT}/what/e/index.md`]: MD, [`${ROOT}/what/e/index.json`]: '{bad',
    });
    expect(api.handle({ method: 'GET', path: '/editor-for', query: { dir: 'what/a' } }).body).toEqual({ editor: 'demo' });
    expect(api.editorFor('what/d').body).toEqual({ editor: null });
    expect(api.editorFor('what/e').body).toEqual({ editor: null });
    expect(api.editorFor('what/none').body).toEqual({ editor: null });
    expect(api.editorFor('../etc').body).toEqual({ editor: null });
  });

  it('lists only cards whose index.json is a valid envelope for the editor', () => {
    const { api } = setup({
      [`${ROOT}/what/a/index.md`]: MD, [`${ROOT}/what/a/index.json`]: env(1),
      [`${ROOT}/what/b/index.md`]: MD, [`${ROOT}/what/b/index.json`]: env('x'),
      [`${ROOT}/what/c/index.md`]: MD,
      [`${ROOT}/what/d/index.md`]: MD, [`${ROOT}/what/d/index.json`]: env(1, '1.0.0', 'other'),
      [`${ROOT}/what/e/index.md`]: MD, [`${ROOT}/what/e/index.json`]: '{bad',
    });
    expect(api.cards('demo')).toEqual({ status: 200, body: [{ dir: 'what/a', valid: true }] });
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
    expect(api.write('demo', 'what/a/index.json', { data: { n: 5 } })).toEqual({ status: 200, body: { ok: true, inspected: false } });
    expect(JSON.parse(files[`${ROOT}/what/a/index.json`])).toEqual({ editor: 'demo', version: '1.2.0', data: { n: 5 } });
    expect(files[`${ROOT}/what/a/index.md`]).toBe('---\ntitle: "Demo" # keep\ninspected: false\nheaderMedia: demo\n---\nbody\n');
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
    expect(api.handle({ method: 'GET', path: '/demo/cards' }).body).toEqual([{ dir: 'what/a', valid: true }]);
    expect(api.handle({ method: 'GET', path: '/demo/read', query: { path: 'what/a/index.json' } }).status).toBe(200);
    expect(api.handle({ method: 'PUT', path: '/demo/write', query: { path: 'what/a/index.json' }, body: { data: { n: 3 } } }).status).toBe(200);
    expect(api.handle({ method: 'GET', path: '/demo/nope' }).status).toBe(404);
    expect(api.handle({ method: 'DELETE', path: '/demo/write' }).status).toBe(404);
  });

  it('with showAll lists every card with its validity', () => {
    const { api } = setup({
      [`${ROOT}/what/a/index.md`]: MD, [`${ROOT}/what/a/index.json`]: env(1),
      [`${ROOT}/what/b/index.md`]: MD,
      [`${ROOT}/what/_t/index.md`]: MD,
    });
    expect(api.cards('demo', { showAll: true }).body).toEqual([{ dir: 'what/a', valid: true }, { dir: 'what/b', valid: false }]);
    expect(api.handle({ method: 'GET', path: '/demo/cards', query: { all: '1' } }).body).toHaveLength(2);
  });
});

describe('open', () => {
  const A = `${ROOT}/what/a`;
  const BARE = '---\ntitle: "Demo"\n---\nbody\n';

  it('writes missing properties with inspected false and a blank index.json, together', () => {
    const { api, files, writes } = setup({ [`${A}/index.md`]: BARE });
    expect(api.open('demo', 'what/a', {})).toEqual({ status: 200, body: { ok: true, dir: 'what/a', inspected: false } });
    expect(files[`${A}/index.md`]).toBe('---\ninspected: false\ntitle: "Demo"\nheaderMedia: demo\n---\nbody\n');
    expect(JSON.parse(files[`${A}/index.json`])).toEqual({ editor: 'demo', version: '1.0.0', data: { n: 0 } });
    expect(writes).toHaveLength(2);
  });

  it('writes nothing when the card already matches and has a valid index.json', () => {
    const { api, writes } = setup({ [`${A}/index.md`]: MD, [`${A}/index.json`]: env(1) });
    expect(api.open('demo', 'what/a', {})).toEqual({ status: 200, body: { ok: true, dir: 'what/a', inspected: true } });
    expect(writes).toEqual([]);
  });

  it('a conflicting property asks first (409 naming it) and writes nothing', () => {
    const md = '---\nheaderMedia: flash-game\n---\n';
    const { api, files, writes } = setup({ [`${A}/index.md`]: md });
    const res = api.open('demo', 'what/a', {});
    expect(res).toEqual({ status: 409, body: { conflicts: [{ property: 'headerMedia', old: 'flash-game', new: 'demo' }] } });
    expect(writes).toEqual([]);
    expect(files[`${A}/index.md`]).toBe(md);
  });

  it('confirm replaces the conflicting value and sets inspected false', () => {
    const { api, files } = setup({ [`${A}/index.md`]: '---\nheaderMedia: flash-game\n# c\n---\nb\n' });
    expect(api.open('demo', 'what/a', { confirm: true }).status).toBe(200);
    expect(files[`${A}/index.md`]).toBe('---\ninspected: false\nheaderMedia: demo\n# c\n---\nb\n');
    expect(files[`${A}/index.json`]).toBeDefined();
  });

  it('an index.json for a different editor is a conflict; confirm replaces it', () => {
    const other = env(1, '1.0.0', 'other');
    const { api, files, writes } = setup({ [`${A}/index.md`]: MD, [`${A}/index.json`]: other });
    const res = api.open('demo', 'what/a', {});
    expect(res.status).toBe(409);
    expect((res.body as any).conflicts).toEqual([{ property: 'index.json', old: 'editor "other"', new: 'editor "demo"' }]);
    expect(writes).toEqual([]);
    expect(api.open('demo', 'what/a', { confirm: true }).status).toBe(200);
    expect(JSON.parse(files[`${A}/index.json`]).editor).toBe('demo');
  });

  it('an unreadable or invalid index.json of this editor is also asked about, never silently replaced', () => {
    const { api, files, writes } = setup({ [`${A}/index.md`]: MD, [`${A}/index.json`]: env('x') });
    expect(api.open('demo', 'what/a', {}).status).toBe(409);
    expect(writes).toEqual([]);
    expect(files[`${A}/index.json`]).toBe(env('x'));
  });

  it('404s a card with no index.md, an unknown editor; 400s a bad path', () => {
    const { api, writes } = setup({});
    expect(api.open('demo', 'what/zz', {}).status).toBe(404);
    expect(api.open('nope', 'what/a', {}).status).toBe(404);
    expect(api.open('demo', '../x', {}).status).toBe(400);
    expect(writes).toEqual([]);
  });

  it('is routed as POST /<id>/open?path=', () => {
    const { api } = setup({ [`${A}/index.md`]: BARE });
    expect(api.handle({ method: 'POST', path: '/demo/open', query: { path: 'what/a' }, body: {} }).status).toBe(200);
  });
});

describe('create', () => {
  const make = (files: Record<string, string> = {}) => {
    const f = fakeFs({ ...files });
    return { ...f, api: createDevEditorsApi({ editors: [demo], fs: f.fs, contentRoot: ROOT, today: () => '2026-11-12' }) };
  };

  it('scaffolds index.md and index.json under the chosen folder and returns the dir', () => {
    const { api, files } = make();
    expect(api.create('demo', { parent: 'what/projects', title: 'My Card' })).toEqual({ status: 200, body: { ok: true, dir: 'what/projects/my-card' } });
    expect(files[`${ROOT}/what/projects/my-card/index.md`]).toBe('---\ntitle: "My Card"\ndate: 2026-11-12\ninspected: false\nheaderMedia: demo\n---\n');
    expect(JSON.parse(files[`${ROOT}/what/projects/my-card/index.json`])).toEqual({ editor: 'demo', version: '1.0.0', data: { n: 0 } });
  });

  it('then appears in the default list', () => {
    const { api } = make();
    api.create('demo', { parent: 'what', title: 'Fresh' });
    expect(api.cards('demo').body).toEqual([{ dir: 'what/fresh', valid: true }]);
  });

  it('refuses an existing card, an empty title, a bad parent, writing nothing', () => {
    const { api, writes } = make({ [`${ROOT}/what/my-card/index.md`]: MD });
    expect(api.create('demo', { parent: 'what', title: 'My Card' }).status).toBe(409);
    expect(api.create('demo', { parent: 'what', title: '!!!' }).status).toBe(400);
    expect(api.create('demo', { parent: 'nowhere', title: 'X' }).status).toBe(400);
    expect(api.create('demo', { parent: 'what/../..', title: 'X' }).status).toBe(400);
    expect(api.create('demo', 'junk').status).toBe(400);
    expect(writes).toEqual([]);
  });

  it('lists the folders a card may be created in', () => {
    const { api } = make({ [`${ROOT}/what/projects/a/index.md`]: MD });
    const body = api.folders().body as string[];
    expect(body).toContain('what');
    expect(body).toContain('what/projects');
    expect(body).toContain('who');
    expect(body).not.toContain('what/projects/a');
  });

  it('is routed as POST /<id>/create and GET /folders', () => {
    const { api } = make();
    expect(api.handle({ method: 'POST', path: '/demo/create', body: { parent: 'what', title: 'Z' } }).status).toBe(200);
    expect(api.handle({ method: 'GET', path: '/folders' }).status).toBe(200);
  });
});

describe('bump', () => {
  const A = `${ROOT}/what/a`;

  function bumpSetup(opts: { inProgress?: string | null; commit?: (paths: string[], message: string) => { ok: true } | { ok: false; error: string } } = {}) {
    const f = fakeFs({ [`${A}/index.md`]: MD, [`${A}/index.json`]: env(1, '1.2.3') });
    const log: string[] = [];
    const git: ContentGit = {
      inProgress: () => { log.push('inProgress'); return opts.inProgress ?? null; },
      commitPaths: (paths, message) => { log.push(`commit ${paths.join(',')} | ${message}`); return opts.commit?.(paths, message) ?? { ok: true }; },
      log: () => [],
      show: () => null,
    };
    const fsLog: ContentFs = { ...f.fs, write: (file, text) => { log.push(`write ${file}`); f.fs.write(file, text); } };
    const api = createDevEditorsApi({ editors: [demo], fs: fsLog, contentRoot: ROOT, git });
    return { api, files: f.files, log };
  }

  it('commits only the card dir as the outgoing version, then writes the new version and flags inspected: false', () => {
    const { api, files, log } = bumpSetup();
    expect(api.bump('demo', 'what/a', 'minor')).toEqual({ status: 200, body: { ok: true, version: '1.3.0', inspected: false } });
    expect(log).toEqual(['inProgress', `commit ${A} | content: demo what/a v1.2.3`, `write ${A}/index.json`, `write ${A}/index.md`]);
    expect(JSON.parse(files[`${A}/index.json`])).toEqual({ editor: 'demo', version: '1.3.0', data: { n: 1 } });
    expect(files[`${A}/index.md`]).toContain('inspected: false');
  });

  it('refuses with the reason when a merge, rebase or cherry-pick is in progress, changing nothing', () => {
    const { api, log } = bumpSetup({ inProgress: 'a merge' });
    const res = api.bump('demo', 'what/a', 'minor');
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toContain('a merge');
    expect(log).toEqual(['inProgress']);
  });

  it('reports a failed commit and does not write the new version', () => {
    const { api, log } = bumpSetup({ commit: () => ({ ok: false, error: 'index.lock exists' }) });
    const res = api.bump('demo', 'what/a', 'patch');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).toContain('index.lock exists');
    expect(log.some((l) => l.startsWith('write'))).toBe(false);
  });

  it('rejects an unknown kind or editor and a card without a valid envelope, touching nothing', () => {
    const { api, log } = bumpSetup();
    expect(api.bump('demo', 'what/a', 'huge' as any).status).toBe(400);
    expect(api.bump('nope', 'what/a', 'minor').status).toBe(404);
    expect(api.bump('demo', 'what/zzz', 'minor').status).toBe(404);
    expect(log).toEqual([]);
  });

  it('routes POST /<id>/bump?path=<card dir>&kind=<kind>', () => {
    const { api, files } = bumpSetup();
    expect(api.handle({ method: 'POST', path: '/demo/bump', query: { path: 'what/a', kind: 'major' } }).body).toEqual({ ok: true, version: '2.0.0', inspected: false });
    expect(JSON.parse(files[`${A}/index.json`]).version).toBe('2.0.0');
  });
});

describe('version history', () => {
  const A = `${ROOT}/what/a`;
  const at = (version: string, n: number) => JSON.stringify({ editor: 'demo', version, data: { n } });

  function historySetup() {
    // newest first, as git log returns them; 1.0.0 was committed twice
    const commits = [
      { commit: 'c4', date: '2026-04-01T00:00:00Z', text: at('2.0.0', 4) },
      { commit: 'c3', date: '2026-03-01T00:00:00Z', text: at('1.1.0', 3) },
      { commit: 'c2', date: '2026-02-01T00:00:00Z', text: at('1.0.0', 2) },
      { commit: 'c1', date: '2026-01-01T00:00:00Z', text: at('1.0.0', 1) },
    ];
    const calls: string[] = [];
    const git: ContentGit = {
      inProgress: () => null,
      commitPaths: () => ({ ok: true }),
      log: (file) => { calls.push(`log ${file}`); return commits.map(({ commit, date }) => ({ commit, date })); },
      show: (commit, file) => { calls.push(`show ${commit} ${file}`); return commits.find((c) => c.commit === commit)?.text ?? null; },
    };
    const f = fakeFs({ [`${A}/index.md`]: MD, [`${A}/index.json`]: env(9, '2.0.1') });
    return { api: createDevEditorsApi({ editors: [demo], fs: f.fs, contentRoot: ROOT, git }), calls };
  }

  it('history lists one entry per committed version, newest first, latest commit each', () => {
    const { api, calls } = historySetup();
    expect(api.history('demo', 'what/a')).toEqual({
      status: 200,
      body: [
        { version: '2.0.0', commit: 'c4', date: '2026-04-01T00:00:00Z' },
        { version: '1.1.0', commit: 'c3', date: '2026-03-01T00:00:00Z' },
        { version: '1.0.0', commit: 'c2', date: '2026-02-01T00:00:00Z' },
      ],
    });
    expect(calls).toContain(`log ${A}/index.json`);
  });

  it('at returns the envelope as of a commit that is in the history', () => {
    const { api } = historySetup();
    expect(api.at('demo', 'what/a', 'c2')).toEqual({ status: 200, body: { editor: 'demo', version: '1.0.0', data: { n: 2 } } });
  });

  it('at refuses a commit that is not in the history, so no arbitrary revision is shown', () => {
    const { api, calls } = historySetup();
    expect(api.at('demo', 'what/a', 'HEAD~5').status).toBe(404);
    expect(calls.some((c) => c.startsWith('show'))).toBe(false);
  });

  it('answers 404 for an unknown editor, 400 for a path outside the content root, 501 with no git', () => {
    const { api } = historySetup();
    expect(api.history('nope', 'what/a').status).toBe(404);
    expect(api.history('demo', '../x').status).toBe(400);
    expect(api.at('demo', 'what/a', '').status).toBe(400);
    const noGit = setup({});
    expect(noGit.api.history('demo', 'what/a').status).toBe(501);
  });

  it('routes GET /<id>/history and /<id>/at', () => {
    const { api } = historySetup();
    expect((api.handle({ method: 'GET', path: '/demo/history', query: { path: 'what/a' } }).body as unknown[]).length).toBe(3);
    expect(api.handle({ method: 'GET', path: '/demo/at', query: { path: 'what/a', commit: 'c3' } }).status).toBe(200);
  });
});
