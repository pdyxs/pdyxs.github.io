import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createContentGit } from './git.ts';

let repo: string;
const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
const put = (rel: string, text: string) => {
  mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
  writeFileSync(path.join(repo, rel), text);
};

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), 'content-git-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'T');
  git('config', 'commit.gpgsign', 'false');
  put('src/content/what/a/index.md', 'a1\n');
  put('src/content/what/b/index.md', 'b1\n');
  put('code.ts', 'x1\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

const adapter = () => createContentGit({ cwd: repo, retryDelayMs: 1 });
const A = () => path.join(repo, 'src/content/what/a');

describe('createContentGit', () => {
  it('commits only the given directory even when other files are dirty', () => {
    put('src/content/what/a/index.md', 'a2\n');
    put('src/content/what/a/index.json', '{}\n');
    put('src/content/what/b/index.md', 'b2\n');
    put('code.ts', 'x2\n');
    expect(adapter().commitPaths([A()], 'content: demo what/a v1.0.0')).toEqual({ ok: true });
    expect(git('log', '-1', '--format=%s').trim()).toBe('content: demo what/a v1.0.0');
    expect(git('show', '--name-only', '--format=', 'HEAD').trim().split('\n').sort()).toEqual([
      'src/content/what/a/index.json',
      'src/content/what/a/index.md',
    ]);
    expect(git('status', '--porcelain').split('\n').filter(Boolean).map((l) => l.slice(3)).sort()).toEqual(['code.ts', 'src/content/what/b/index.md']);
  });

  it('carries on when there is nothing to commit', () => {
    const before = git('rev-parse', 'HEAD');
    expect(adapter().commitPaths([A()], 'm')).toEqual({ ok: true });
    expect(git('rev-parse', 'HEAD')).toBe(before);
  });

  it.each(['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD'])('reports %s in progress', (marker) => {
    expect(adapter().inProgress()).toBeNull();
    writeFileSync(path.join(repo, '.git', marker), git('rev-parse', 'HEAD'));
    expect(adapter().inProgress()).toContain(marker.replace('_HEAD', '').toLowerCase().replace('cherry_pick', 'cherry-pick'));
  });

  it.each(['rebase-merge', 'rebase-apply'])('reports %s in progress', (dir) => {
    mkdirSync(path.join(repo, '.git', dir));
    expect(adapter().inProgress()).toContain('rebase');
  });

  it('with index.lock held, retries once after a wait then fails without committing', () => {
    put('src/content/what/a/index.md', 'a2\n');
    writeFileSync(path.join(repo, '.git', 'index.lock'), '');
    const before = git('rev-parse', 'HEAD');
    const waits: number[] = [];
    const res = createContentGit({ cwd: repo, retryDelayMs: 7, sleep: (ms) => waits.push(ms) }).commitPaths([A()], 'm');
    expect(res.ok).toBe(false);
    expect(waits).toEqual([7]);
    rmSync(path.join(repo, '.git', 'index.lock'));
    expect(git('rev-parse', 'HEAD')).toBe(before);
    expect(readFileSync(path.join(repo, 'src/content/what/a/index.md'), 'utf8')).toBe('a2\n');
  });

  it('succeeds when the lock clears during the wait', () => {
    put('src/content/what/a/index.md', 'a2\n');
    const lock = path.join(repo, '.git', 'index.lock');
    writeFileSync(lock, '');
    const res = createContentGit({ cwd: repo, retryDelayMs: 1, sleep: () => rmSync(lock) }).commitPaths([A()], 'm');
    expect(res).toEqual({ ok: true });
    expect(git('log', '-1', '--format=%s').trim()).toBe('m');
  });
});
