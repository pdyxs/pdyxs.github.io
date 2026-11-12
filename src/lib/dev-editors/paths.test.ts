import { describe, it, expect } from 'vitest';
import { resolveCardFile } from './paths.ts';

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
