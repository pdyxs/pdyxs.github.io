import { describe, it, expect } from 'vitest';
import { resolveCardFile } from './paths.ts';

const ROOT = '/repo/src/content';

describe('resolveCardFile', () => {
  it('accepts index.json in a card folder and returns its absolute path', () => {
    expect(resolveCardFile(ROOT, 'what/toys/particulars/index.json')).toEqual({
      ok: true,
      file: '/repo/src/content/what/toys/particulars/index.json',
    });
  });

  it.each([
    ['../../etc/passwd'],
    ['what/../../../etc/index.json'],
    ['what/toys/../../../../index.json'],
    ['/etc/index.json'],
    ['what\\toys\\index.json'],
    ['what/toys/index.json\0.png'],
    ['what/toys/index.md'],
    ['what/toys/other.json'],
    ['what/toys/index.json/x'],
    ['index.json'],
    ['elsewhere/toys/index.json'],
    ['what/_templates/index.json'],
    ['what/.obsidian/index.json'],
    ['what//toys/index.json'],
    [''],
  ])('rejects %j', (rel) => {
    expect(resolveCardFile(ROOT, rel).ok).toBe(false);
  });
});
