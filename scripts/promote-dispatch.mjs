/**
 * Dispatch a promotion from the CLI.
 *
 *   npm run promote          # content only — what the daily run does
 *   npm run promote:code     # code as well, wholesale
 *   npm run promote:plan     # local dry run, costs no CI
 *
 * Thin wrapper over `gh workflow run`, and it exists for three reasons that a
 * bare gh invocation gets wrong:
 *
 *   1. It dispatches on `main`. Promotion REFUSES to run anywhere else, because
 *      the deploy is a workflow_call and a called workflow runs in the caller's
 *      branch context — from `dev` the github-pages environment rejects the
 *      deployment after the promotion has already pushed, leaving production
 *      silently stale.
 *   2. It refuses when `dev` has unpushed commits. The runner promotes from
 *      ORIGIN/dev, so local-only work simply does not ship, and the run goes
 *      green having quietly left it behind — the hardest kind of failure to
 *      notice, because everything reports success.
 *   3. It prints the plan first. A promotion is deliberate; seeing what crosses
 *      before spending a build is the point.
 */

import { execFileSync, execSync } from 'node:child_process';

const MODE = process.argv[2] === '--code' ? 'code' : 'content';

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', ...opts });
}

function fail(msg) {
  console.error(`\npromote: ${msg}\n`);
  process.exit(1);
}

try {
  run('git', ['fetch', 'origin', '--quiet']);
} catch {
  fail('could not reach the remote.');
}

// 2. Unpushed work would be silently left behind.
const ahead = run('git', ['rev-list', '--count', 'origin/dev..dev']).trim();
if (ahead !== '0') {
  const commits = run('git', ['log', '--oneline', 'origin/dev..dev']).trimEnd();
  fail(
    `dev has ${ahead} unpushed commit(s). Promotion runs from origin/dev, so these ` +
      `would NOT ship and the run would still go green:\n\n${commits}\n\n` +
      `Push them first:  git push origin dev`,
  );
}

const unpromoted = run('git', ['log', '--oneline', 'origin/main..origin/dev']).trimEnd();
if (!unpromoted) {
  console.log('promote: origin/main is already level with origin/dev — nothing to promote.');
  process.exit(0);
}

// 3. What is about to cross, computed locally and for free.
console.log(`\nUnpromoted commits on dev:\n${unpromoted}\n`);
execSync(
  `node scripts/promote.mjs --dry-run --from origin/dev --to origin/main${MODE === 'code' ? ' --code' : ''}`,
  { stdio: 'inherit' },
);

console.log(`\nDispatching a ${MODE === 'code' ? 'CODE + content' : 'content-only'} promotion on main...`);
try {
  run('gh', ['workflow', 'run', 'promote.yml', '--ref', 'main', '-f', `code=${MODE === 'code'}`]);
} catch (err) {
  fail(`gh workflow run failed:\n${err?.stderr ?? err}`);
}

console.log('Dispatched. Following the run (Ctrl-C is safe — it keeps running):\n');
execSync('sleep 6');
const id = run('gh', [
  'run', 'list', '--workflow=promote.yml', '--limit', '1',
  '--json', 'databaseId', '--jq', '.[0].databaseId',
]).trim();
try {
  execSync(`gh run watch ${id} --exit-status --interval 15`, { stdio: 'inherit' });
} catch {
  fail(`run ${id} did not succeed — see: gh run view ${id} --log-failed`);
}
