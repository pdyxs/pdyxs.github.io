/**
 * Rollback: back a bad publish out of production (docs/plans/publishing-pipeline.md
 * §7, issue #177). Both halves, because each is silent alone:
 *
 *   1. on main: restore the card's last-good version (git rm if it is new)
 *   2. on dev:  inspected: false, so the daily run does not re-promote it
 *
 *   node scripts/rollback.mjs <uid> [--from dev] [--to main]
 *
 * Commits locally on both branches and ends checked out on `--from`; the
 * workflow pushes both atomically. Decisions live in
 * src/lib/site/inspected-gate.ts.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  cardFileForUid,
  planRollbackStep,
  setInspectedFalse,
} from '../src/lib/site/inspected-gate.ts';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function main() {
  const argv = process.argv.slice(2);
  let uid;
  let from = 'dev';
  let to = 'main';
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--from') from = argv[++i];
    else if (argv[i] === '--to') to = argv[++i];
    else if (!uid) uid = argv[i];
    else throw new Error(`rollback: unknown argument "${argv[i]}"`);
  }
  if (!uid) throw new Error('usage: rollback.mjs <uid> [--from dev] [--to main]');

  const file = cardFileForUid(uid);
  const dir = dirname(file);

  let onMain = true;
  try {
    git(['cat-file', '-e', `${to}:${file}`]);
  } catch {
    onMain = false;
  }

  let addedByLastChange = false;
  if (onMain) {
    const last = git(['log', '-n1', '--format=%H', to, '--', dir]);
    // Promotions are -s ours merges, whose first parent is main's own history.
    try {
      git(['cat-file', '-e', `${last}^1:${file}`]);
    } catch {
      addedByLastChange = true;
    }
  }
  // Fail before touching anything: step 2 needs the card on `from`.
  try {
    git(['cat-file', '-e', `${from}:${file}`]);
  } catch {
    throw new Error(`rollback: ${file} does not exist on ${from}`);
  }
  const step = planRollbackStep({ onMain, addedByLastChange });

  // Step 1: main.
  git(['checkout', to]);
  if (step === 'remove') {
    git(['rm', '-r', '-q', '--', dir]);
  } else {
    const last = git(['log', '-n1', '--format=%H', to, '--', dir]);
    // Whole directory: images sit beside the markdown. Files the bad change
    // added are removed first so the restore is exact.
    git(['rm', '-r', '-q', '--', dir]);
    git(['checkout', `${last}^1`, '--', dir]);
  }
  git(['commit', '-m', `Rollback ${uid}: ${step === 'remove' ? 'remove new card' : 'restore last-good version'}\n\nPaired with inspected: false on ${from} so the next promotion does not undo it.`]);
  console.log(`rollback: ${step} ${dir} on ${to}.`);

  // Step 2: dev.
  git(['checkout', from]);
  const raw = readFileSync(file, 'utf8');
  const next = setInspectedFalse(raw);
  if (next !== raw) {
    writeFileSync(file, next);
    git(['add', '--', file]);
    git(['commit', '-m', `chore: rollback ${uid} — inspected: false\n\nMachine edit: retracts the card from the daily promotion pathspec (publishing-pipeline.md §7).`]);
  }
  console.log(`rollback: inspected: false on ${from}.`);
}

try {
  main();
} catch (err) {
  console.error(String(err?.message ?? err));
  process.exit(1);
}
