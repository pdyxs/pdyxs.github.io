import { describe, it, expect } from 'vitest';
import { compareCards, folderOf, rankCards, type RankableCard } from './ranking';

/** A card in `what/posts` with nothing declared, unless overridden. */
function c(overrides: Partial<RankableCard> & { uid: string }): RankableCard {
  return { priority: 0, ...overrides };
}

const uidsOf = (cards: RankableCard[]) => cards.map(card => card.uid);

describe('folderOf', () => {
  it('is everything above the card\'s own slug', () => {
    expect(folderOf('what/posts/stories/arctic/ch-1')).toBe('what/posts/stories/arctic');
    expect(folderOf('lonely')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Each rung, in isolation
// ---------------------------------------------------------------------------

describe('the comparator chain, rung by rung', () => {
  it('1. ranks a card matching more selected values first', () => {
    const a = c({ uid: 'what/posts/a' });
    const b = c({ uid: 'what/posts/b' });
    const matchCount = (card: RankableCard) => (card.uid === b.uid ? 2 : 1);
    expect(uidsOf(rankCards([a, b], { matchCount }))).toEqual([b.uid, a.uid]);
  });

  it('2. ranks higher priority first, and negatives last', () => {
    const high = c({ uid: 'what/posts/a', priority: 100 });
    const zero = c({ uid: 'what/posts/b' });
    const down = c({ uid: 'what/posts/c', priority: -100 });
    expect(uidsOf(rankCards([zero, down, high]))).toEqual([high.uid, zero.uid, down.uid]);
  });

  it('3. ranks unseen before seen', () => {
    const seen = c({ uid: 'what/posts/a' });
    const unseen = c({ uid: 'what/posts/b' });
    const isSeen = (card: RankableCard) => card.uid === seen.uid;
    expect(uidsOf(rankCards([seen, unseen], { isSeen }))).toEqual([unseen.uid, seen.uid]);
  });

  it('4. ranks by `order` — ascending, within one folder', () => {
    const first = c({ uid: 'what/posts/stories/arctic/z', order: 1 });
    const second = c({ uid: 'what/posts/stories/arctic/a', order: 2 });
    expect(uidsOf(rankCards([second, first]))).toEqual([first.uid, second.uid]);
  });

  it('4. does NOT apply `order` across folders — it is a within-folder sequence', () => {
    // An arctic chapter's `order: 1` says nothing about a puzzle. Both are in
    // different folders, so the chain falls through to uid.
    const chapter = c({ uid: 'what/posts/stories/arctic/z', order: 1 });
    const puzzle = c({ uid: 'what/puzzles/a', order: 9 });
    expect(uidsOf(rankCards([puzzle, chapter]))).toEqual([chapter.uid, puzzle.uid]);
  });

  it('5. applies the folder\'s declared sort between two of its cards', () => {
    const easy = c({ uid: 'what/puzzles/z', sort: { key: 'difficulty', direction: 'asc', value: 1 } });
    const hard = c({ uid: 'what/puzzles/a', sort: { key: 'difficulty', direction: 'asc', value: 5 } });
    expect(uidsOf(rankCards([hard, easy]))).toEqual([easy.uid, hard.uid]);
  });

  it('5. sorts a card missing the sort key last', () => {
    const rated = c({ uid: 'what/puzzles/z', sort: { key: 'difficulty', direction: 'asc', value: 3 } });
    const unrated = c({ uid: 'what/puzzles/a', sort: { key: 'difficulty', direction: 'asc' } });
    expect(uidsOf(rankCards([unrated, rated]))).toEqual([rated.uid, unrated.uid]);
  });

  it('5. does not fire across folders — results are not grouped by folder', () => {
    const late = c({ uid: 'what/posts/a', sort: { key: 'date', direction: 'desc', value: 2000 } });
    const early = c({ uid: 'what/puzzles/b', sort: { key: 'date', direction: 'desc', value: 1000 } });
    // Different folders, so uid decides: posts/a before puzzles/b.
    expect(uidsOf(rankCards([early, late]))).toEqual([late.uid, early.uid]);
  });

  it('6. falls back to uid, so the order is deterministic', () => {
    const a = c({ uid: 'what/posts/a' });
    const b = c({ uid: 'what/posts/b' });
    expect(uidsOf(rankCards([b, a]))).toEqual([a.uid, b.uid]);
    expect(compareCards(a, a)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Precedence: each rung outranks the next
// ---------------------------------------------------------------------------

describe('rung precedence', () => {
  it('1 outranks 2: a better filter match beats a higher priority', () => {
    const matched = c({ uid: 'what/posts/a', priority: 0 });
    const boosted = c({ uid: 'what/posts/b', priority: 500 });
    const matchCount = (card: RankableCard) => (card.uid === matched.uid ? 2 : 1);
    expect(uidsOf(rankCards([boosted, matched], { matchCount }))).toEqual([matched.uid, boosted.uid]);
  });

  it('2 outranks 3: an authored boost still wins for a returning visitor', () => {
    // The whole point of putting priority above seen-ness (#68): otherwise a
    // boost quietly stops mattering to exactly the readers it was aimed at.
    const boostedButSeen = c({ uid: 'what/posts/a', priority: 100 });
    const unseen = c({ uid: 'what/posts/b' });
    const isSeen = (card: RankableCard) => card.uid === boostedButSeen.uid;
    expect(uidsOf(rankCards([unseen, boostedButSeen], { isSeen }))).toEqual([
      boostedButSeen.uid,
      unseen.uid,
    ]);
  });

  it('3 outranks 4: unseen wins over a lower `order`', () => {
    const seenFirst = c({ uid: 'what/posts/stories/arctic/a', order: 1 });
    const unseenLater = c({ uid: 'what/posts/stories/arctic/b', order: 2 });
    const isSeen = (card: RankableCard) => card.uid === seenFirst.uid;
    expect(uidsOf(rankCards([seenFirst, unseenLater], { isSeen }))).toEqual([
      unseenLater.uid,
      seenFirst.uid,
    ]);
  });

  it('4 outranks 5: `order` wins over the folder\'s declared sort', () => {
    const ordered = c({
      uid: 'what/puzzles/a',
      order: 1,
      sort: { key: 'difficulty', direction: 'asc', value: 5 },
    });
    const easier = c({
      uid: 'what/puzzles/b',
      order: 2,
      sort: { key: 'difficulty', direction: 'asc', value: 1 },
    });
    expect(uidsOf(rankCards([easier, ordered]))).toEqual([ordered.uid, easier.uid]);
  });

  it('5 outranks 6: the folder sort wins over uid', () => {
    const newer = c({ uid: 'what/posts/z', sort: { key: 'date', direction: 'desc', value: 2000 } });
    const older = c({ uid: 'what/posts/a', sort: { key: 'date', direction: 'desc', value: 1000 } });
    expect(uidsOf(rankCards([older, newer]))).toEqual([newer.uid, older.uid]);
  });
});

describe('rankCards', () => {
  it('does not mutate its input', () => {
    const cards = [c({ uid: 'what/posts/b' }), c({ uid: 'what/posts/a' })];
    rankCards(cards);
    expect(uidsOf(cards)).toEqual(['what/posts/b', 'what/posts/a']);
  });

  it('treats an absent runtime context as "no filters, nothing seen"', () => {
    const a = c({ uid: 'what/posts/a', priority: 1 });
    const b = c({ uid: 'what/posts/b', priority: 2 });
    expect(uidsOf(rankCards([a, b]))).toEqual([b.uid, a.uid]);
  });
});
