import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The rehearsal (issue #175). Everything else about promotion is a policy that
// can be revisited; this is the one mechanism that fails SILENTLY AND
// PERMANENTLY if it is wrong, so it is exercised end to end against a real git
// repository rather than asserted from the plan alone.
//
// A synthetic repo rather than a clone of this one: the cases below need a
// card to be ticked, un-ticked, deleted and flagged between runs, and doing
// that to real content would mean editing the tree the preview server serves.

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../scripts/promote.mjs');

let repo: string;

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
}

function write(path: string, contents: string) {
  const full = join(repo, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, contents);
}

function card(opts: { inspected?: boolean; awaitsCode?: boolean; body?: string }) {
  const lines = ['---', 'title: A card'];
  if (opts.inspected !== undefined) lines.push(`inspected: ${opts.inspected}`);
  if (opts.awaitsCode !== undefined) lines.push(`awaitsCode: ${opts.awaitsCode}`);
  lines.push('---', '', opts.body ?? 'body');
  return lines.join('\n');
}

function commitAll(message: string) {
  git('add', '-A');
  git('commit', '-q', '-m', message);
}

function promote(...args: string[]): string {
  return execFileSync('node', [SCRIPT, '--from', 'dev', '--to', 'main', ...args], {
    cwd: repo,
    encoding: 'utf8',
  });
}

/** Files present on `main`, so assertions read the promoted tree, not the worktree. */
function onMain(): string[] {
  return git('ls-tree', '-r', '--name-only', 'main').split('\n').filter(Boolean);
}

function mainContent(path: string): string {
  return git('show', `main:${path}`);
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'promote-rehearsal-'));
  git('init', '-q', '-b', 'dev');
  git('config', 'user.email', 'rehearsal@example.com');
  git('config', 'user.name', 'Rehearsal');
  git('config', 'commit.gpgsign', 'false');

  // A seed both branches share: one ready card, plus code and structure.
  write('src/content/what/posts/seed/index.md', card({ inspected: true }));
  write('src/lib/code.ts', 'export const v = 1;\n');
  write('src/content/what/_config.yaml', 'renderer: card\n');
  commitAll('seed');
  git('branch', 'main');
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('promotion rehearsal', () => {
  it('M — an edited inspected card crosses, assets included', () => {
    write('src/content/what/posts/seed/index.md', card({ inspected: true, body: 'edited' }));
    write('src/content/what/posts/seed/header.png', 'PNG');
    commitAll('edit seed');

    promote();

    expect(mainContent('src/content/what/posts/seed/index.md')).toContain('edited');
    // The whole point of the card DIRECTORY being the unit: an index.md-only
    // pathspec would publish the text and strand the image it references.
    expect(onMain()).toContain('src/content/what/posts/seed/header.png');
  });

  it('A — a new inspected card crosses', () => {
    write('src/content/what/posts/fresh/index.md', card({ inspected: true }));
    commitAll('add fresh');

    promote();

    expect(onMain()).toContain('src/content/what/posts/fresh/index.md');
  });

  it('withheld — a new uninspected card is never staged', () => {
    write('src/content/what/posts/wip/index.md', card({ inspected: false }));
    write('src/content/what/posts/wip/draft.png', 'PNG');
    commitAll('add wip');

    promote();

    expect(onMain().some((p) => p.includes('/wip/'))).toBe(false);
  });

  it('D — a card deleted on dev is removed from main, ungated', () => {
    rmSync(join(repo, 'src/content/what/posts/seed'), { recursive: true });
    commitAll('delete seed');

    promote();

    expect(onMain().some((p) => p.includes('/seed/'))).toBe(false);
  });

  // THE MERGE-BASE TRAP, and the reason this file exists. With a merge's tree,
  // run 1's withholding would advance the merge-base past this card and run 2
  // would see it unchanged since that base — leaving it withheld forever.
  it('re-tick — a card withheld on run 1 crosses on run 2', () => {
    write('src/content/what/posts/later/index.md', card({ inspected: false }));
    commitAll('add later, uninspected');
    promote();
    expect(onMain().some((p) => p.includes('/later/'))).toBe(false);

    write('src/content/what/posts/later/index.md', card({ inspected: true }));
    commitAll('tick later');
    promote();

    expect(onMain()).toContain('src/content/what/posts/later/index.md');
  });

  it('code — a content run leaves code and structure alone; a code run takes them', () => {
    write('src/lib/code.ts', 'export const v = 2;\n');
    write('src/content/what/newlens.lens.yaml', 'label: New\n');
    commitAll('code + lens yaml');

    promote();
    expect(mainContent('src/lib/code.ts')).toContain('v = 1');
    expect(onMain()).not.toContain('src/content/what/newlens.lens.yaml');

    promote('--code');
    expect(mainContent('src/lib/code.ts')).toContain('v = 2');
    // Issue #165's stranded-YAML hole.
    expect(onMain()).toContain('src/content/what/newlens.lens.yaml');
  });

  it('awaitsCode — held on a content run, crosses on a code run, flag consumed', () => {
    write('src/content/what/posts/feature/index.md', card({ inspected: true, awaitsCode: true }));
    commitAll('add feature card awaiting code');

    promote();
    expect(onMain().some((p) => p.includes('/feature/'))).toBe(false);

    promote('--code');
    expect(onMain()).toContain('src/content/what/posts/feature/index.md');

    // Consumed on dev — left set, every FUTURE edit to this card would
    // silently wait for an arbitrary future code push.
    const onDev = git('show', 'dev:src/content/what/posts/feature/index.md');
    expect(onDev).not.toContain('awaitsCode');
    // ...and NOT re-flagged as uninspected, which would withhold the card that
    // was just promoted, forever. This is the exemption CLAUDE.md must state.
    expect(onDev).toContain('inspected: true');
  });

  // The OTHER half of the merge-base trap, and the more dangerous half: with a
  // merge's tree, the content run below would advance the base past src/lib
  // too, so the later code run would see the file unchanged since that base
  // and keep main's — stranding every code change on dev PERMANENTLY, with no
  // flag to recompute from and no error anywhere.
  it('a content-only run does not strand code from a later code run', () => {
    write('src/lib/code.ts', 'export const v = 2;\n');
    write('src/content/what/posts/seed/index.md', card({ inspected: true, body: 'edited' }));
    commitAll('code and content together');

    promote();
    expect(mainContent('src/content/what/posts/seed/index.md')).toContain('edited');
    expect(mainContent('src/lib/code.ts')).toContain('v = 1');

    // Nothing on dev changed in between — only the decision to promote code.
    promote('--code');
    expect(mainContent('src/lib/code.ts')).toContain('v = 2');
  });

  // The rollback path (#177) leans on exactly this: a hand-edit to main is
  // healed the moment the card is re-ticked, so a retraction never needs
  // remembering.
  it('re-asserts a card hand-reverted on main once it is edited again', () => {
    write('src/content/what/posts/seed/index.md', card({ inspected: true, body: 'v2' }));
    commitAll('edit to v2');
    promote();
    expect(mainContent('src/content/what/posts/seed/index.md')).toContain('v2');

    // Stand in for a rollback: main is hand-reverted while dev keeps v2.
    git('checkout', 'main');
    write('src/content/what/posts/seed/index.md', card({ inspected: true, body: 'body' }));
    commitAll('rollback on main');
    git('checkout', 'dev');

    write('src/content/what/posts/seed/index.md', card({ inspected: true, body: 'v3' }));
    commitAll('fix to v3');
    promote();

    expect(mainContent('src/content/what/posts/seed/index.md')).toContain('v3');
  });

  it('keeps `git log main..dev` honest, so what is unpromoted is knowable', () => {
    write('src/content/what/posts/seed/index.md', card({ inspected: true, body: 'edited' }));
    commitAll('edit seed');
    promote();

    // -s ours records dev as a parent, so a promoted commit leaves the list.
    expect(git('log', '--oneline', 'main..dev').trim()).toBe('');
  });

  it('promotes nothing, and says so, when dev and main agree', () => {
    expect(promote()).toContain('nothing to promote');
  });

  it('refuses a nested card rather than promoting it under its ancestor gate', () => {
    write('src/content/what/posts/seed/chapter/index.md', card({ inspected: false }));
    commitAll('nest a card inside a card');

    expect(() => promote()).toThrow(/nested card directories/);
  });
});
