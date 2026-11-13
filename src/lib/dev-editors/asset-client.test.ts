import { describe, it, expect } from 'vitest';
import { assetUrl, listAssets, uploadAsset, type FetchLike } from './asset-client.ts';

describe('asset client', () => {
  it('builds an encoded url for an image', () => {
    expect(assetUrl('demo', 'what/a b', 'p&q.png')).toBe('/__dev-editors/demo/asset?path=what%2Fa%20b&name=p%26q.png');
  });

  it('lists assets, throwing the api error on failure', async () => {
    const ok: FetchLike = async (url) => ({ ok: true, status: 200, json: async () => (url.includes('/demo/assets?path=what%2Fa') ? ['a.png'] : []) });
    expect(await listAssets('demo', 'what/a', ok)).toEqual(['a.png']);
    const bad: FetchLike = async () => ({ ok: false, status: 404, json: async () => ({ error: 'no card' }) });
    await expect(listAssets('demo', 'what/a', bad)).rejects.toThrow('no card');
  });

  it('uploads base64 bytes with the overwrite flag, reporting an existing file', async () => {
    const calls: { url: string; body: any }[] = [];
    const reply = (status: number, body: unknown): FetchLike => async (url, init) => {
      calls.push({ url, body: JSON.parse(init!.body!) });
      return { ok: status < 400, status, json: async () => body };
    };
    const file = { name: 'p.png', arrayBuffer: async () => new Uint8Array([0x89, 0x50, 0xff]).buffer };
    expect(await uploadAsset('demo', 'what/a', file, {}, reply(200, { ok: true, filename: 'p.png' }))).toEqual({ ok: true, filename: 'p.png' });
    expect(calls[0].url).toBe('/__dev-editors/demo/asset?path=what%2Fa');
    expect(calls[0].body).toEqual({ filename: 'p.png', data: Buffer.from([0x89, 0x50, 0xff]).toString('base64'), overwrite: false });
    const exists = await uploadAsset('demo', 'what/a', file, { overwrite: false }, reply(409, { error: 'exists' }));
    expect(exists).toEqual({ ok: false, exists: true, error: 'exists' });
    await uploadAsset('demo', 'what/a', file, { overwrite: true }, reply(200, { filename: 'p.png' }));
    expect(calls[2].body.overwrite).toBe(true);
  });
});
