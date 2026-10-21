import { describe, it, expect } from 'vitest';
import { createEditorApi } from './api.ts';
import type { EditorFs } from './api.ts';

const ROOT = '/repo/src/content';

function memFs(initial: Record<string, string>): EditorFs & { files: Map<string, string> } {
  const files = new Map(Object.entries(initial));
  return {
    files,
    read: (f) => files.get(f) ?? null,
    write: (f, text) => void files.set(f, text),
    list: () => [...files.keys()].map((f) => f.slice(ROOT.length + 1)),
  };
}

const valid = { walls: { width: 10, height: 6 }, player: { x: 0, y: 0 } };
const make = (initial: Record<string, string> = {}) => {
  const fs = memFs(initial);
  return { fs, api: createEditorApi({ contentRoot: ROOT, fs, today: () => '2026-10-14' }) };
};

describe('editor api: write', () => {
  it('writes a valid scenario to the card folder, formatted', () => {
    const { fs, api } = make();
    const res = api.write('what/toys/x/index.json', valid);
    expect(res.status).toBe(200);
    expect(fs.files.get(`${ROOT}/what/toys/x/index.json`)).toBe(JSON.stringify(valid, null, 2) + '\n');
  });

  it.each(['../../package.json', 'what/toys/x/index.md', '/etc/passwd', 'what/../../x/index.json'])(
    'rejects %s and writes nothing',
    (rel) => {
      const { fs, api } = make();
      expect(api.write(rel, valid).status).toBe(400);
      expect(fs.files.size).toBe(0);
    },
  );

  it('rejects an invalid scenario with its errors', () => {
    const { fs, api } = make();
    const res = api.write('what/toys/x/index.json', { walls: {} });
    expect(res.status).toBe(422);
    expect(fs.files.size).toBe(0);
  });
});

describe('editor api: cards and read', () => {
  const files = {
    [`${ROOT}/what/toys/a/index.md`]: '---\n---\n',
    [`${ROOT}/what/toys/a/index.json`]: JSON.stringify(valid),
    [`${ROOT}/what/toys/b/index.md`]: '---\n---\n',
    [`${ROOT}/what/toys/b/hero.png`]: 'x',
    [`${ROOT}/what/toys/_config.yaml`]: '',
    [`${ROOT}/_templates/what/index.md`]: '',
    [`${ROOT}/what/posts/c/index.json`]: '{}',
  };

  it('lists card folders (those with an index.md) and whether they have a scenario', () => {
    const { api } = make(files);
    expect(api.cards().body).toEqual([
      { dir: 'what/toys/a', hasScenario: true },
      { dir: 'what/toys/b', hasScenario: false },
    ]);
  });

  it('reads a card scenario', () => {
    const { api } = make(files);
    expect(api.read('what/toys/a/index.json')).toEqual({ status: 200, body: valid });
  });

  it('404s a missing scenario and 400s a path outside card folders', () => {
    const { api } = make(files);
    expect(api.read('what/toys/b/index.json').status).toBe(404);
    expect(api.read('../secret/index.json').status).toBe(400);
  });
});

describe('editor api: create', () => {
  it('writes index.md with headerMedia and a blank valid index.json', () => {
    const { fs, api } = make();
    const res = api.create('what/toys/new-one', 'New one');
    expect(res.status).toBe(200);
    const md = fs.files.get(`${ROOT}/what/toys/new-one/index.md`)!;
    expect(md).toContain('headerMedia: particulars');
    expect(md).toContain('title: "New one"');
    expect(md).toContain('date: 2026-10-14');
    expect(api.read('what/toys/new-one/index.json').status).toBe(200);
  });

  it('refuses to overwrite an existing card, and refuses paths outside the roots', () => {
    const { fs, api } = make({ [`${ROOT}/what/toys/a/index.md`]: 'mine' });
    expect(api.create('what/toys/a', 'x').status).toBe(409);
    expect(fs.files.get(`${ROOT}/what/toys/a/index.md`)).toBe('mine');
    expect(api.create('../evil', 'x').status).toBe(400);
    expect(api.create('what/toys/blank', '  ').status).toBe(400);
  });
});
