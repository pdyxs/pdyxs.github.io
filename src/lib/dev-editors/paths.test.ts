import { describe, it, expect } from 'vitest';
import { resolveCardAsset, resolveCardFile } from './paths.ts';

const ROOT = '/site/src/content';

describe('resolveCardFile', () => {
  it('allows index.json and index.md directly inside a card folder', () => {
    expect(resolveCardFile(ROOT, 'what/toys/demo/index.json')).toEqual({ ok: true, file: `${ROOT}/what/toys/demo/index.json` });
    expect(resolveCardFile(ROOT, 'why/learn/x/y/index.md')).toEqual({ ok: true, file: `${ROOT}/why/learn/x/y/index.md` });
  });

  it.each([
    '', '/etc/passwd', '../x/index.json', 'what/../../x/index.json', 'what//a/index.json', 'what/./a/index.json',
    'what\\a\\index.json', 'what/a/other.json', 'what/a/index.json/', 'index.json', 'what/index.json',
    'nope/a/index.json', 'what/_templates/a/index.json', 'what/.hidden/a/index.json', 'what/a/index.json\0',
  ])('refuses %j', (rel) => {
    expect(resolveCardFile(ROOT, rel).ok).toBe(false);
  });
});

describe('resolveCardAsset', () => {
  it('allows an image file directly inside a card folder', () => {
    expect(resolveCardAsset(ROOT, 'what/toys/demo/pic.PNG')).toEqual({ ok: true, file: `${ROOT}/what/toys/demo/pic.PNG` });
    for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']) expect(resolveCardAsset(ROOT, `what/a/b.${ext}`).ok).toBe(true);
  });

  it.each([
    '', '/etc/x.png', 'what/a/x.txt', 'what/a/x', 'what/a/index.md', 'what/a/index.json', 'what/a/.png', 'what/a/.x.png',
    'what/a/_x.png', 'what/a/sub/../x.png', '../a/b/x.png', 'what/a/x.png/', 'what//a/x.png', 'x.png', 'what/x.png',
    'nope/a/x.png', 'what/_t/a/x.png', 'what/.h/a/x.png', 'what\\a\\x.png', 'what/a/x.png\0', 'what/a/x.js.png.exe',
  ])('refuses %j', (rel) => {
    expect(resolveCardAsset(ROOT, rel).ok).toBe(false);
  });
});
