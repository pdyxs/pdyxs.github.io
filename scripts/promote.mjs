/**
 * Promotion: assert `main`'s tree from `dev`, per the gates.
 *
 * The git shell around src/lib/promotion.ts, which owns every decision. See
 * docs/plans/publishing-pipeline.md §5 and issue #175.
 *
 *   node scripts/promote.mjs [--code] [--dry-run] [--from dev] [--to main]
 *
 *   --code      also promote code (wholesale) and the cards awaiting it
 *   --dry-run   print the plan; touch nothing
 *   --from/--to override the branch pair (the rehearsal uses scratch branches)
 *
 * WHY THE MERGE'S TREE IS NEVER USED. A merge commit advances the merge-base
 * past every path it claims to have merged, so anything reverted after a
 * `git merge --no-commit dev` is, to git, already handled: the next three-way
 * merge sees it unchanged on `dev` since the new base and keeps `main`'s side.
 * A card withheld once would stay withheld forever, and a content-only
 * promotion would silently strand every code change on `dev` permanently. So
 * `-s ours` records the ancestry and produces `main`'s own tree, and the tree
 * is then asserted from a diff computed against the CURRENT frontmatter.
 *
 * That is also why no conflict is possible, ever: nothing is merged.
 */

import { execFileSync } from 'node:child_process';
import matter from 'gray-matter';
import {
  classifyCard,
  parseNameStatus,
  planPromotion,
  nestedCardDirs,
} from '../src/lib/promotion.ts';

const CONTENT_ROOT = 'src/content';
const CARD_FILE = 'index.md';

function git(args, opts = {}) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
}

/** Every path in `ref`'s tree. */
function listTree(ref) {
  return git(['ls-tree', '-r', '--name-only', '-z', ref]).split('\0').filter(Boolean);
}

/** Card directories in `ref` — a directory holding an index.md under src/content. */
function cardDirsIn(paths) {
  const suffix = `/${CARD_FILE}`;
  return paths
    .filter((p) => p.startsWith(`${CONTENT_ROOT}/`) && p.endsWith(suffix))
    .map((p) => p.slice(0, -suffix.length))
    .filter((d) => !d.startsWith(`${CONTENT_ROOT}/.`));
}

/**
 * Card dir -> classification, read from `ref`'s frontmatter.
 *
 * Read out of the git object store rather than the working tree: promotion
 * runs with `main` checked out, so the working tree is the wrong branch by
 * construction, and a checkout-then-read would be a second source of truth.
 */
function classifyCardsIn(ref, cardDirs) {
  const out = new Map();
  for (const dir of cardDirs) {
    let raw;
    try {
      raw = git(['show', `${ref}:${dir}/${CARD_FILE}`]);
    } catch {
      continue;
    }
    out.set(dir, classifyCard(matter(raw).data ?? {}));
  }
  return out;
}

function parseArgs(argv) {
  const opts = { code: false, dryRun: false, from: 'dev', to: 'main' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--code') opts.code = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--from') opts.from = argv[++i];
    else if (a === '--to') opts.to = argv[++i];
    else throw new Error(`promote: unknown argument "${a}"`);
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { from, to } = opts;

  for (const ref of [from, to]) {
    try {
      git(['rev-parse', '--verify', `${ref}^{commit}`]);
    } catch {
      throw new Error(`promote: branch "${ref}" does not exist`);
    }
  }

  const devPaths = listTree(from);
  const devCardDirs = cardDirsIn(devPaths);
  const mainCardDirs = cardDirsIn(listTree(to));

  // The unit of promotion is the card directory, so a card inside a card would
  // be promoted by its ancestor's gate instead of its own — publishing an
  // uninspected card because the folder above it was ticked. Always empty
  // today; this is what keeps it that way.
  const nested = nestedCardDirs(devCardDirs);
  if (nested.length > 0) {
    throw new Error(
      `promote: nested card directories are unsupported — a card would inherit its ` +
        `ancestor's publish gate:\n  ${nested.join('\n  ')}`,
    );
  }

  const cardsOnDev = classifyCardsIn(from, devCardDirs);
  const diff = parseNameStatus(
    git(['diff', '--name-status', '--no-renames', '-z', to, from]),
  );

  const plan = planPromotion({
    diff,
    cardsOnDev,
    cardDirsOnMain: new Set(mainCardDirs),
    promoteCode: opts.code,
  });

  const tally = { content: 0, code: 0, withheld: 0 };
  for (const c of cardsOnDev.values()) tally[c] += 1;

  console.log(`promote: ${from} -> ${to}${opts.code ? ' (with code)' : ' (content only)'}`);
  console.log(
    `  cards on ${from}: ${cardsOnDev.size} ` +
      `(${tally.content} ready, ${tally.code} awaiting code, ${tally.withheld} withheld)`,
  );
  console.log(`  changed paths: ${diff.length}`);
  console.log(`  -> checkout: ${plan.checkout.length}, remove: ${plan.remove.length}`);
  if (plan.awaitsCodeConsumed.length > 0) {
    console.log(`  -> awaitsCode consumed on ${plan.awaitsCodeConsumed.length} card(s)`);
  }

  if (opts.dryRun) {
    for (const p of plan.checkout) console.log(`    + ${p}`);
    for (const p of plan.remove) console.log(`    - ${p}`);
    for (const d of plan.awaitsCodeConsumed) console.log(`    ~ ${d} (awaitsCode cleared)`);
    return;
  }

  if (plan.checkout.length === 0 && plan.remove.length === 0) {
    console.log('promote: nothing to promote.');
    return;
  }

  const startingRef = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  git(['checkout', to]);
  try {
    // Ancestry bookkeeping ONLY: -s ours produces a tree identical to `to`'s,
    // so `git log to..from` stays an honest "what has not been promoted".
    git(['merge', '--no-commit', '--no-ff', '-s', 'ours', from]);

    // xargs-free and argv-limit-free: stage in chunks rather than one exec.
    for (const chunk of chunks(plan.checkout, 200)) {
      git(['checkout', from, '--', ...chunk]);
    }
    for (const chunk of chunks(plan.remove, 200)) {
      git(['rm', '-q', '--', ...chunk]);
    }

    git(['commit', '-m', commitMessage(opts, plan)]);
    console.log(`promote: committed to ${to}.`);
  } catch (err) {
    git(['merge', '--abort'], { stdio: 'ignore' });
    git(['checkout', startingRef], { stdio: 'ignore' });
    throw err;
  }

  if (plan.awaitsCodeConsumed.length > 0) {
    consumeAwaitsCode(from, plan.awaitsCodeConsumed);
  }
  git(['checkout', startingRef]);
}

function chunks(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function commitMessage(opts, plan) {
  const what = opts.code ? 'code and content' : 'content';
  return (
    `Promote ${what} to production\n\n` +
    `${plan.checkout.length} path(s) updated, ${plan.remove.length} removed.\n` +
    (plan.awaitsCodeConsumed.length > 0
      ? `awaitsCode consumed: ${plan.awaitsCodeConsumed.join(', ')}\n`
      : '')
  );
}

/**
 * Strip `awaitsCode` from the cards just promoted on the code trigger.
 *
 * Left set it lies — a card marked as needing a feature that shipped a year
 * ago — and worse, every FUTURE edit to that card would silently wait for an
 * arbitrary future code push.
 *
 * THE TRAP: this is a machine edit to card frontmatter, and CLAUDE.md's
 * standing rule says a machine edit sets `inspected: false`. Doing that here
 * would withhold the card that was just promoted, and withhold it again on
 * every later run — forever. So this carries the same explicit exemption
 * scripts/backfill-inspected.mjs has: it is pipeline bookkeeping ABOUT a card,
 * not a change to its content.
 */
function consumeAwaitsCode(ref, cardDirs) {
  git(['checkout', ref]);
  let changed = 0;
  for (const dir of cardDirs) {
    const file = `${dir}/${CARD_FILE}`;
    const raw = git(['show', `${ref}:${file}`]);
    const next = stripAwaitsCode(raw);
    if (next === raw) continue;
    execFileSync('sh', ['-c', `cat > "$0"`, file], { input: next });
    changed += 1;
  }
  if (changed === 0) return;
  git(['add', '--', ...cardDirs.map((d) => `${d}/${CARD_FILE}`)]);
  git([
    'commit',
    '-m',
    'chore: consume awaitsCode on promoted cards\n\n' +
      'Pipeline bookkeeping, not a content edit — deliberately does NOT set\n' +
      'inspected: false, which would withhold the cards just promoted.\n',
  ]);
  console.log(`promote: cleared awaitsCode on ${changed} card(s) on ${ref}.`);
}

/**
 * Removes the `awaitsCode` line from a card's frontmatter, textually.
 *
 * Textual rather than a gray-matter round-trip because re-serialising would
 * rewrite the WHOLE frontmatter block — quoting, key order, comments and the
 * blank lines the Obsidian Properties pane relies on — turning a one-key
 * deletion into a diff across every card it touches.
 */
export function stripAwaitsCode(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!match) return raw;
  const body = match[1];
  const kept = body.split('\n').filter((line) => !/^awaitsCode\s*:/.test(line));
  if (kept.length === body.split('\n').length) return raw;
  return raw.slice(0, match.index) + `---\n${kept.join('\n')}\n---` + raw.slice(match.index + match[0].length);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (err) {
    console.error(String(err?.message ?? err));
    process.exit(1);
  }
}
