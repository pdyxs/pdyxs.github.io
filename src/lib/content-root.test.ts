// Regression cover for pdyxs/pdyxs.github.io#88: the content root was derived
// from `import.meta.url`, which is the module's location, not the project's.
// Under `astro build` these modules run from the bundled prerender output, so
// every `_config.yaml` read as absent and the folder cascade silently yielded
// nothing in production.
//
// The fixture-backed tests in folder-config.test.ts / tag-registry.test.ts pass
// either way — they inject their own reader and never touch the real path. These
// tests exercise the real resolution instead.

import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { CONTENT_ROOT, assertContentRoot } from './content-root';
import { makeFileReader, resolveFolderCascade } from './folder-config';
import { discoverTagSources, makeContentTreeReader } from './tag-registry';

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = resolve(process.cwd());

describe('content root resolution', () => {
  it('is rooted at the working directory, not at this module', () => {
    expect(CONTENT_ROOT).toBe(resolve(PROJECT_ROOT, 'src', 'content'));
    expect(assertContentRoot()).toBe(CONTENT_ROOT);
  });

  it('the real file reader resolves a known _config.yaml against the real tree', async () => {
    const reader = makeFileReader();
    const text = await reader('what/puzzles/_config.yaml');
    expect(text).toContain('width: 520px');
  });

  it('the real cascade reaches a real card (the whole of #88 in one assertion)', async () => {
    const cascade = await resolveFolderCascade(
      'what/puzzles/plans-of-a-medic',
      makeFileReader(),
      ['location']
    );
    expect(cascade.width).toBe('520px');
    expect(cascade.dateLabel).toBe('Published');
    expect(cascade.gallery).toBe(false);
    // `location: none` was folded into excludeTags by issue #116 — the puzzles
    // config now states its suppression there, and it must survive the walk.
    expect(cascade.excludeTags).toContain('generated/location');
  });

  it('the real tree reader discovers the container identities and tag declarations', async () => {
    const { containerIdentities, tagDeclarations } = await discoverTagSources(makeContentTreeReader());
    expect(containerIdentities.length).toBeGreaterThan(0);
    expect(tagDeclarations.length).toBeGreaterThan(0);
    expect(containerIdentities.map(i => i.value)).toContain('what:puzzles');
  });

  it('neither reader derives its path from its own module location', async () => {
    // The exact mistake, guarded at the source: `import.meta.url` in either
    // reader means the path follows the bundle, and the bug is back — silently,
    // because both readers swallow ENOENT per file.
    for (const file of ['folder-config.ts', 'tag-registry.ts', 'content-root.ts']) {
      const source = await readFile(resolve(PROJECT_ROOT, 'src/lib', file), 'utf-8');
      const code = source.replace(/^\s*(\/\/.*|\*.*|\/\*.*)$/gm, '');
      expect(code, `${file} must not derive content paths from its own location`)
        .not.toContain('import.meta.url');
    }
  });

  it('fails loudly rather than silently when run outside the project', async () => {
    // A wrong root used to be indistinguishable from "no _config.yaml exists".
    // Run the real module from a cwd with no content tree and require a throw.
    // Node ≥22.18 (the engines floor) strips types, same as scripts/*.mjs do.
    const entry = resolve(PROJECT_ROOT, 'src/lib/content-root.ts');
    await expect(
      execFileAsync(
        process.execPath,
        ['--input-type=module', '-e', `const m = await import(${JSON.stringify(entry)}); m.assertContentRoot();`],
        { cwd: '/' }
      )
    ).rejects.toThrow(/Content root not found/);
  });
});
