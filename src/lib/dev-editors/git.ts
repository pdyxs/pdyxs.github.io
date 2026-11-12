// The real ContentGit adapter: git run in the checkout the dev server runs in.
// Content auto-sync commits in the same checkout and checks the same in-progress
// markers, hence the pathspec commit and the index.lock retry.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { ContentGit } from './types.ts';

export interface ContentGitOptions {
  cwd: string;
  /** Wait before the single retry when the index is locked. */
  retryDelayMs?: number;
  /** Blocking wait; injectable for tests. */
  sleep?: (ms: number) => void;
}

const MARKERS: [string, string][] = [
  ['MERGE_HEAD', 'a merge'],
  ['CHERRY_PICK_HEAD', 'a cherry-pick'],
  ['REVERT_HEAD', 'a revert'],
  ['rebase-merge', 'a rebase'],
  ['rebase-apply', 'a rebase'],
];

const blockingSleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export function createContentGit({ cwd, retryDelayMs = 500, sleep = blockingSleep }: ContentGitOptions): ContentGit {
  const run = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const gitDir = () => run('rev-parse', '--absolute-git-dir').trim();
  const locked = () => existsSync(path.join(gitDir(), 'index.lock'));

  const attempt = (paths: string[], message: string): { ok: true } | { ok: false; error: string } => {
    try {
      if (locked()) return { ok: false, error: 'git index.lock exists' };
      run('add', '-A', '--', ...paths);
      if (run('status', '--porcelain', '--', ...paths).trim() === '') return { ok: true };
      run('commit', '-m', message, '--', ...paths);
      return { ok: true };
    } catch (err) {
      const e = err as { stderr?: string; message?: string };
      return { ok: false, error: (e.stderr || e.message || 'git failed').trim() };
    }
  };

  const rel = (file: string) => path.relative(cwd, file).split(path.sep).join('/');

  return {
    log(file) {
      const out = run('log', '--format=%H%x09%cI', '--', rel(file));
      return out
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [commit, date] = line.split('\t');
          return { commit, date };
        });
    },
    show(commit, file) {
      try {
        return run('show', `${commit}:${rel(file)}`);
      } catch {
        return null;
      }
    },
    inProgress() {
      const dir = gitDir();
      return MARKERS.find(([marker]) => existsSync(path.join(dir, marker)))?.[1] ?? null;
    },
    commitPaths(paths, message) {
      const first = attempt(paths, message);
      if (first.ok || !/index\.lock/.test(first.error)) return first;
      sleep(retryDelayMs);
      return attempt(paths, message);
    },
  };
}
