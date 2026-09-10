/**
 * Does production need a rebuild that no git change would trigger?
 *
 * Exactly one thing can make yesterday's build wrong while `main`'s tree is
 * unchanged: a `status: scheduled` card whose publish date has passed.
 * `computeStatusVisibility` decides visibility at BUILD time against `now`
 * (src/lib/status-visibility.ts), so the card only appears once something
 * rebuilds — which is what build.yml's daily cron used to exist for.
 *
 *   node scripts/pending-publish.mjs --ref main --since <ISO8601>
 *
 * Prints `crossed=true|false`. `--since` is the last successful deployment, so
 * the window is exact: a card that crossed BEFORE that deploy is already live
 * and must not trigger another rebuild — checking `date <= now` alone would
 * rebuild every day forever once any card crossed, which is the failure the
 * unconditional cron already had.
 */

import { execFileSync } from 'node:child_process';
import matter from 'gray-matter';
import { resolveStatus } from '../src/lib/content/cards/status-visibility.ts';

const CONTENT_ROOT = 'src/content';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 });
}

function parseArgs(argv) {
  const opts = { ref: 'main', since: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--ref') opts.ref = argv[++i];
    else if (argv[i] === '--since') opts.since = argv[++i];
    else throw new Error(`pending-publish: unknown argument "${argv[i]}"`);
  }
  return opts;
}

export function crossedInWindow(entries, since, now) {
  return entries.filter(({ status, date }) => {
    if (resolveStatus(status, undefined) !== 'scheduled') return false;
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
    return date.getTime() > since.getTime() && date.getTime() <= now.getTime();
  });
}

function main() {
  const { ref, since } = parseArgs(process.argv.slice(2));
  const sinceDate = since ? new Date(since) : new Date(0);
  if (Number.isNaN(sinceDate.getTime())) throw new Error(`pending-publish: bad --since "${since}"`);
  const now = new Date();

  const files = git(['ls-tree', '-r', '--name-only', '-z', ref])
    .split('\0')
    .filter((p) => p.startsWith(`${CONTENT_ROOT}/`) && p.endsWith('/index.md'))
    .filter((p) => !p.startsWith(`${CONTENT_ROOT}/.`));

  const entries = files.map((path) => {
    const { data } = matter(git(['show', `${ref}:${path}`]));
    return { path, status: data?.status, date: data?.date ? new Date(data.date) : undefined };
  });

  const crossed = crossedInWindow(entries, sinceDate, now);

  console.log(`pending-publish: ${ref}, window ${sinceDate.toISOString()} -> ${now.toISOString()}`);
  console.log(`  scheduled cards: ${entries.filter((e) => resolveStatus(e.status, undefined) === 'scheduled').length}`);
  for (const c of crossed) console.log(`  crossed: ${c.path} (${c.date.toISOString()})`);
  console.log(`crossed=${crossed.length > 0}`);

  if (process.env.GITHUB_OUTPUT) {
    execFileSync('sh', ['-c', `echo "crossed=${crossed.length > 0}" >> "$GITHUB_OUTPUT"`]);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (err) {
    console.error(String(err?.message ?? err));
    process.exit(1);
  }
}
