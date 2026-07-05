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
    if (entry.name.startsWith('_')) continue;
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
    const names = topLevel.map(e => e.name).filter(n => n !== 'frontpage.ts');
    for (const name of names) {
      expect(statSync(join(CONTENT_DIR, name)).isDirectory()).toBe(true);
    }
    // "what" is the only dimension with real card content — who/when/where
    // also have thin folder roots now, but only ever holding `.tag.yaml`
    // declarations (no index.md cards); "why" has neither yet.
    expect(names.sort()).toEqual(['what', 'when', 'where', 'who']);
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
    ['what/puzzles/cartography', 'what:puzzles'],
    ['what/work/dot', 'what:work'],
    ['what/writing/2008-07-27-why-portal', 'what:writing'],
    ['what/stories/arctic/00-introduction', 'what:stories/arctic'],
    ['what/stories/galapagos/01-tourism', 'what:stories/galapagos'],
  ];

  it.each(samples)('%s -> %s', (uid, expected) => {
    expect(derivePathTags(uid)).toEqual([expected]);
  });
});
