import { describe, it, expect } from 'vitest';
import { searchCards, selectorEntries, newCardFiles, slugify } from './selector.ts';

const cards = [
  { dir: 'what/b', valid: false },
  { dir: 'what/a', valid: true },
  { dir: 'who/c', valid: true },
];

describe('selectorEntries', () => {
  it('by default lists only valid cards, sorted', () => {
    expect(selectorEntries(cards, { showAll: false })).toEqual([
      { dir: 'what/a', valid: true },
      { dir: 'who/c', valid: true },
    ]);
  });
  it('with show all lists every card, keeping validity', () => {
    expect(selectorEntries(cards, { showAll: true }).map((c) => c.dir)).toEqual(['what/a', 'what/b', 'who/c']);
    expect(selectorEntries(cards, { showAll: true })[1].valid).toBe(false);
  });
});

describe('slugify', () => {
  it('makes a folder name from a title', () => {
    expect(slugify('  My New Card! ')).toBe('my-new-card');
    expect(slugify('!!!')).toBe('');
  });
});

describe('newCardFiles', () => {
  it('scaffolds index.md with title, date, inspected false and the editor frontmatter, and index.json from blank', () => {
    const files = newCardFiles({ title: 'A "Title"', isoDate: '2026-11-12', frontmatter: { headerMedia: 'demo' }, envelope: { editor: 'demo', version: '1.0.0', data: { n: 0 } } });
    expect(files.indexMd).toBe('---\ntitle: "A \\"Title\\""\ndate: 2026-11-12\ninspected: false\nheaderMedia: demo\n---\n');
    expect(JSON.parse(files.indexJson)).toEqual({ editor: 'demo', version: '1.0.0', data: { n: 0 } });
  });
});

describe('searchCards', () => {
  const cards = [{ dir: 'what/toys/dev-editor-demo' }, { dir: 'what/games/flatland' }, { dir: 'who/paul' }];
  it('matches every term anywhere in the dir, ignoring case, in order', () => {
    expect(searchCards(cards, '')).toEqual(cards);
    expect(searchCards(cards, 'WHAT')).toEqual(cards.slice(0, 2));
    expect(searchCards(cards, 'flat what')).toEqual([cards[1]]);
    expect(searchCards(cards, 'demo toys')).toEqual([cards[0]]);
    expect(searchCards(cards, 'nothing')).toEqual([]);
  });
});
