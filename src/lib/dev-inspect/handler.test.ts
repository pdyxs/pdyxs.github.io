import { describe, it, expect } from 'vitest';
import { createInspectHandler } from './handler.ts';

function setup(files: Record<string, string>) {
  const writes: { file: string; text: string }[] = [];
  const handle = createInspectHandler({
    root: '/site',
    fs: {
      read: (f) => files[f] ?? null,
      write: (file, text) => {
        writes.push({ file, text });
      },
    },
  });
  return { handle, writes };
}

const FILE = '/site/src/content/what/projects/foo/index.md';

describe('inspect handler', () => {
  it('sets inspected: true on the card file, changing only that line', () => {
    const { handle, writes } = setup({ [FILE]: '---\ntitle: X\ninspected: false\n---\nbody\n' });
    expect(handle({ method: 'POST', body: { uid: 'what/projects/foo' } })).toEqual({ status: 200, body: { ok: true } });
    expect(writes).toEqual([{ file: FILE, text: '---\ntitle: X\ninspected: true\n---\nbody\n' }]);
  });

  it('writes nothing when the card is already inspected', () => {
    const { handle, writes } = setup({ [FILE]: '---\ninspected: true\n---\nb' });
    expect(handle({ method: 'POST', body: { uid: 'what/projects/foo' } }).status).toBe(200);
    expect(writes).toEqual([]);
  });

  it.each(['', '../x', 'what/../../x', '/what/x', '_templates/x', 'what/_x', '.obsidian/x', 'what/.x', 'tag/x'])(
    'refuses uid %j with 400 and writes nothing',
    (uid) => {
      const { handle, writes } = setup({});
      expect(handle({ method: 'POST', body: { uid } }).status).toBe(400);
      expect(writes).toEqual([]);
    },
  );

  it.each([undefined, null, 'what/x', { uid: 5 }, {}])('refuses a malformed body %j with 400', (body) => {
    const { handle, writes } = setup({});
    expect(handle({ method: 'POST', body }).status).toBe(400);
    expect(writes).toEqual([]);
  });

  it('answers 404 for a valid uid with no file, writing nothing', () => {
    const { handle, writes } = setup({});
    expect(handle({ method: 'POST', body: { uid: 'what/projects/foo' } }).status).toBe(404);
    expect(writes).toEqual([]);
  });

  it('answers 405 to anything but POST', () => {
    const { handle, writes } = setup({ [FILE]: '---\n---\n' });
    expect(handle({ method: 'GET', body: undefined }).status).toBe(405);
    expect(writes).toEqual([]);
  });
});
