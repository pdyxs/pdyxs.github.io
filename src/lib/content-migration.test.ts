// Guards the two structural invariants of the dimension-rooted content tree
// (issue #32 / DEC-004, DEC-005):
//   1. every card is a folder with an index.md (no flat "foo.md" duplicates,
//      no glob-loader uid collisions)
//   2. derivePathTags still derives the same `what:` value for real content
//      after the physical relocation — this is a *relocation*, not a
//      re-tagging, so a sample of real cards must round-trip unchanged.
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { uidFromContentPath } from './content-uid';
import { derivePathTags } from './tag-inheritance';

const CONTENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../content');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // Mirrors what the content glob can reach: CONTENT_GLOB_PATTERN only
    // matches under the five dimension roots, so neither underscore-prefixed
    // folders (`_templates/`) nor dot-prefixed ones (the vault's `.obsidian/`,
    // `.trash/`) are reachable.
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

function allContentMarkdownFiles(): string[] {
  return walk(CONTENT_DIR)
    .map(f => relative(CONTENT_DIR, f).split('\\').join('/'))
    .filter(rel => !rel.startsWith('tag/') && /\.(md|mdx)$/i.test(rel));
}

describe('content migration invariants', () => {
  it('every card under content/ is an index.md, not a flat "foo.md"', () => {
    const files = allContentMarkdownFiles();
    expect(files.length).toBeGreaterThan(0);
    const nonIndex = files.filter(f => !f.endsWith('/index.md') && !f.endsWith('/index.mdx'));
    expect(nonIndex).toEqual([]);
  });

  it('no two cards resolve to the same uid', () => {
    const files = allContentMarkdownFiles();
    const uids = files.map(uidFromContentPath);
    expect(new Set(uids).size).toBe(uids.length);
  });

  it('the top level of content/ contains only dimension folders (plus the frontpage config)', () => {
    const topLevel = readdirSync(CONTENT_DIR, { withFileTypes: true });
    // content/ is also an Obsidian vault root (issue #54), so it carries vault
    // infrastructure — `.obsidian/`, `_templates/`. Both are unreachable by the
    // content glob, which is the property that makes them safe to sit here; the
    // filter below is that same rule, not an exemption list.
    const names = topLevel
      .map(e => e.name)
      .filter(n => n !== 'frontpage.ts')
      .filter(n => !n.startsWith('.') && !n.startsWith('_'));
    for (const name of names) {
      expect(statSync(join(CONTENT_DIR, name)).isDirectory()).toBe(true);
    }
    // Every top-level folder must be one of the five dimensions, but not every
    // dimension has to exist yet — they materialise as content arrives, and an
    // empty one (git can't track an empty directory) is present locally and
    // absent in a fresh clone. Asserting the exact set made this fail whenever
    // a dimension root was created ahead of its first card; the invariant being
    // guarded is "nothing but a dimension up here", so check the subset.
    const DIMENSIONS = ['what', 'when', 'where', 'who', 'why'];
    expect(names.filter(n => !DIMENSIONS.includes(n))).toEqual([]);
  });
});

describe('derivePathTags value parity (no re-tagging across the relocation)', () => {
  // Each case is a real card's new dimension-rooted uid, paired with the
  // `what:` value it derived *before* the move under the old collection/id
  // scheme (verified by hand against the pre-migration derivePathTags(collection, id)
  // implementation). If a physical relocation ever changes one of these, that's
  // a regression — either a bad move or the folder-cascade renderer moved
  // to the wrong level.
  const samples: Array<[uid: string, expected: string]> = [
    ['what/posts/about-me', 'what:posts'],
    ['what/projects/interactive-theatre/art-heist', 'what:projects/interactive-theatre'],
    ['what/puzzles/experimental-fog/cartography', 'what:puzzles/experimental-fog'],
    ['what/work/dot', 'what:work'],
    ['what/writing/2008-07-27-why-portal', 'what:writing'],
    ['what/stories/arctic/00-introduction', 'what:stories/arctic'],
    ['what/stories/galapagos/01-tourism', 'what:stories/galapagos'],
  ];

  it.each(samples)('%s -> %s', (uid, expected) => {
    expect(derivePathTags(uid)).toEqual([expected]);
  });
});
