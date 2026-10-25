import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// The thin CLI CI calls; the decision itself is covered in inspected-gate.test.ts.
let root: string;
const card = (uid: string, fm: string) => {
  mkdirSync(join(root, uid), { recursive: true });
  writeFileSync(join(root, uid, 'index.md'), `---\n${fm}\n---\nbody\n`);
};
const run = () =>
  spawnSync(process.execPath, ['scripts/assert-inspected.mjs', root], { encoding: 'utf8' });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'inspected-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('scripts/assert-inspected.mjs', () => {
  it('passes a tree of inspected cards and ignores vault infrastructure', () => {
    card('what/a', 'inspected: true');
    card('_templates/t', 'title: scaffold');
    card('what/.trash/x', 'inspected: false');
    expect(run().status).toBe(0);
  });

  it('fails naming a deliberately un-ticked card', () => {
    card('what/a', 'inspected: true');
    card('what/b', 'inspected: false');
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('what/b');
  });

  it('fails a card with no inspected key', () => {
    card('who/c', 'title: x');
    expect(run().status).toBe(1);
  });
});
