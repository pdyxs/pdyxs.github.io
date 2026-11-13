import { describe, expect, it } from 'vitest';
import { validateEnvelope, parseEnvelope } from '../../../lib/dev-editors/envelope.ts';
import { crdbrdEditor } from '../definition.ts';
import { runImport, type RunFs } from './run.ts';

function memFs(initial: Record<string, string | Uint8Array>) {
  const files = new Map(Object.entries(initial));
  const fs: RunFs = {
    async readText(p) {
      const v = files.get(p);
      if (v === undefined) throw new Error(`ENOENT ${p}`);
      return typeof v === 'string' ? v : new TextDecoder().decode(v);
    },
    async list(dir) {
      const prefix = dir.replace(/\/$/, '') + '/';
      return [...new Set([...files.keys()].filter((f) => f.startsWith(prefix)).map((f) => f.slice(prefix.length).split('/')[0]))];
    },
    async exists(p) {
      return files.has(p);
    },
    async readBytes(p) {
      const v = files.get(p);
      if (v === undefined) throw new Error(`ENOENT ${p}`);
      return typeof v === 'string' ? new TextEncoder().encode(v) : v;
    },
    async writeBytes(p, b) {
      files.set(p, b);
    },
    async writeText(p, t) {
      files.set(p, t);
    },
  };
  return { files, fs };
}

const dumpFiles = {
  '/d/games/g1.json': { name: 'Time Fight', logo: 'i1' },
  '/d/games/g1/properties/logo.json': { name: 'Logo', type: 'image', active: true },
  '/d/games/g1/images/i1.json': { name: 'l.png', path: 'images/g1/l.png', active: true },
};
const dump = () => ({
  ...Object.fromEntries(Object.entries(dumpFiles).map(([k, v]) => [k, JSON.stringify(v)])),
  '/d/images/g1/l.png': new Uint8Array([1, 2, 3]),
  '/card/index.md': '---\ntitle: Time Fight\n---\n',
});

describe('runImport', () => {
  it('writes a valid crdbrd envelope and copies the images into the card folder', async () => {
    const { files, fs } = memFs(dump());
    const out = await runImport({ fs, dumpDir: '/d', gameId: 'g1', cardDir: '/card', force: false });
    const parsed = parseEnvelope(files.get('/card/index.json') as string);
    expect(parsed.ok).toBe(true);
    const envelope = (parsed as { envelope: { editor: string; version: string; data: { name: string; values: unknown } } }).envelope;
    expect(envelope.editor).toBe('crdbrd');
    expect(envelope.version).toBe('1.0.0');
    expect(envelope.data.name).toBe('Time Fight');
    expect(envelope.data.values).toEqual({ logo: 'l.png' });
    expect(validateEnvelope(crdbrdEditor, envelope)).toEqual([]);
    expect(files.get('/card/l.png')).toEqual(new Uint8Array([1, 2, 3]));
    expect(out.warnings).toEqual([]);
  });

  it('leaves index.md untouched', async () => {
    const { files, fs } = memFs(dump());
    await runImport({ fs, dumpDir: '/d', gameId: 'g1', cardDir: '/card', force: false });
    expect(files.get('/card/index.md')).toBe('---\ntitle: Time Fight\n---\n');
  });

  it('refuses to overwrite an existing crdbrd index.json without force, and changes nothing', async () => {
    const { files, fs } = memFs({ ...dump(), '/card/index.json': '{"editor":"crdbrd","version":"1.0.3","data":{}}' });
    await expect(runImport({ fs, dumpDir: '/d', gameId: 'g1', cardDir: '/card', force: false })).rejects.toThrow(/--force/);
    expect(files.get('/card/index.json')).toBe('{"editor":"crdbrd","version":"1.0.3","data":{}}');
    expect(files.has('/card/l.png')).toBe(false);
  });

  it('overwrites with force', async () => {
    const { files, fs } = memFs({ ...dump(), '/card/index.json': '{"editor":"crdbrd","version":"1.0.3","data":{}}' });
    await runImport({ fs, dumpDir: '/d', gameId: 'g1', cardDir: '/card', force: true });
    expect((files.get('/card/index.json') as string).includes('Time Fight')).toBe(true);
  });

  it('refuses a card folder that has no index.md', async () => {
    const files = dump();
    delete (files as Record<string, unknown>)['/card/index.md'];
    const { fs } = memFs(files);
    await expect(runImport({ fs, dumpDir: '/d', gameId: 'g1', cardDir: '/card', force: false })).rejects.toThrow(/index\.md/);
  });

  it('warns about an image file missing from the dump, and still writes the game', async () => {
    const files = dump();
    delete (files as Record<string, unknown>)['/d/images/g1/l.png'];
    const { files: out, fs } = memFs(files);
    const res = await runImport({ fs, dumpDir: '/d', gameId: 'g1', cardDir: '/card', force: false });
    expect(res.warnings.some((w) => /l\.png/.test(w))).toBe(true);
    expect(out.has('/card/index.json')).toBe(true);
  });

  it('refuses to write a game crdbrd would not validate, and writes nothing', async () => {
    const { files, fs } = memFs({
      ...dump(),
      '/d/games/g1/concepts/logo.json': JSON.stringify({ name: 'Clashes with the property id', active: true }),
    });
    await expect(runImport({ fs, dumpDir: '/d', gameId: 'g1', cardDir: '/card', force: false })).rejects.toThrow(/duplicate id "logo"/);
    expect(files.has('/card/index.json')).toBe(false);
    expect(files.has('/card/l.png')).toBe(false);
  });
});
