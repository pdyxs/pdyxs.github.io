import { describe, it, expect } from 'vitest';
import { discoverCollapseConfig } from './collapse-config';
import type { TreeReader } from './tag-registry';

/** Fixture TreeReader from a flat path -> content map (mirrors tag-registry.test.ts). */
function makeTreeReaderFromFiles(files: Record<string, string>): TreeReader {
  const paths = Object.keys(files);
  return {
    async readFile(path) {
      return files[path] ?? null;
    },
    async listDir(dir) {
      const prefix = dir ? `${dir}/` : '';
      const seen = new Map<string, boolean>();
      for (const p of paths) {
        if (!p.startsWith(prefix)) continue;
        const rest = p.slice(prefix.length);
        const slashIdx = rest.indexOf('/');
        if (slashIdx === -1) seen.set(rest, false);
        else seen.set(rest.slice(0, slashIdx), true);
      }
      return [...seen.entries()].map(([name, isDirectory]) => ({ name, isDirectory }));
    },
  };
}

describe('discoverCollapseConfig', () => {
  it('maps `collapse: true` to an empty (first-child) target', async () => {
    const reader = makeTreeReaderFromFiles({
      'what/posts/stories/arctic/_config.yaml': 'collapse: true\n',
      'what/posts/stories/arctic/00-intro/index.md': '',
    });
    const config = await discoverCollapseConfig(reader);
    expect(config.get('what/posts/stories/arctic')).toEqual({});
  });

  it('maps `collapse: <slug>` to an explicit target', async () => {
    const reader = makeTreeReaderFromFiles({
      'what/posts/stories/arctic/_config.yaml': 'collapse: 00-intro\n',
      'what/posts/stories/arctic/00-intro/index.md': '',
    });
    const config = await discoverCollapseConfig(reader);
    expect(config.get('what/posts/stories/arctic')).toEqual({ target: '00-intro' });
  });

  it('omits folders whose _config.yaml has no collapse key', async () => {
    const reader = makeTreeReaderFromFiles({
      'what/posts/stories/arctic/_config.yaml': 'name: The Arctic Circle\n',
      'what/posts/stories/arctic/00-intro/index.md': '',
    });
    const config = await discoverCollapseConfig(reader);
    expect(config.has('what/posts/stories/arctic')).toBe(false);
  });

  it('finds collapse configs nested several levels deep', async () => {
    const reader = makeTreeReaderFromFiles({
      'what/_config.yaml': 'name: What\n',
      'what/posts/stories/arctic/_config.yaml': 'collapse: true\n',
      'what/posts/stories/galapagos/_config.yaml': 'collapse: 00-start\n',
      'what/posts/stories/arctic/00-intro/index.md': '',
      'what/posts/stories/galapagos/00-start/index.md': '',
    });
    const config = await discoverCollapseConfig(reader);
    expect(config.size).toBe(2);
    expect(config.get('what/posts/stories/arctic')).toEqual({});
    expect(config.get('what/posts/stories/galapagos')).toEqual({ target: '00-start' });
  });
});
