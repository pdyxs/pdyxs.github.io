import { describe, it, expect } from 'vitest';
import { compareCards, folderOf, rankCards, type RankableCard } from '@browse/results/ranking';
import { serialiseBrowseCard } from '@browse/results/browse-card';
import type { CardMeta } from '@content/cards/cards';
import type { SerialisedCard } from '@browse/results/browse-helpers';

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

  it('2. pins the highest-priority unseen card(s) ahead of everything else', () => {
    const seenHighPriority = c({ uid: 'what/posts/a', priority: 100 });
    const unseenLowPriority = c({ uid: 'what/posts/b', priority: -5 });
    const isSeen = (card: RankableCard) => card.uid === seenHighPriority.uid;
    // The unseen card is the only unseen one, so it's trivially "top priority
    // among unseen" and gets pinned — even though its own priority is far
    // below the seen card's.
    expect(uidsOf(rankCards([seenHighPriority, unseenLowPriority], { isSeen }))).toEqual([
      unseenLowPriority.uid,
      seenHighPriority.uid,
    ]);
  });

  it('2. pins every unseen card tied at the top unseen priority, not just one', () => {
    const seen = c({ uid: 'what/posts/a', priority: 100 });
    const unseenTop1 = c({ uid: 'what/posts/b', priority: 5 });
    const unseenTop2 = c({ uid: 'what/posts/c', priority: 5 });
    const unseenLower = c({ uid: 'what/posts/d', priority: 1 });
    const isSeen = (card: RankableCard) => card.uid === seen.uid;
    const ranked = uidsOf(rankCards([seen, unseenLower, unseenTop1, unseenTop2], { isSeen }));
    // Both top-tied unseen cards lead; the lower-priority unseen one falls back
    // to rung 3 (priority) and loses to the seen card there.
    expect(ranked.slice(0, 2).sort()).toEqual([unseenTop1.uid, unseenTop2.uid].sort());
    expect(ranked.slice(2)).toEqual([seen.uid, unseenLower.uid]);
  });

  it('2. is scoped per matchCount tier — a pin never promotes a worse filter match', () => {
    const betterMatchSeen = c({ uid: 'what/posts/a', priority: 0 });
    const worseMatchUnseen = c({ uid: 'what/posts/b', priority: 0 });
    const matchCount = (card: RankableCard) => (card.uid === betterMatchSeen.uid ? 2 : 1);
    const isSeen = (card: RankableCard) => card.uid === betterMatchSeen.uid;
    expect(uidsOf(rankCards([worseMatchUnseen, betterMatchSeen], { matchCount, isSeen }))).toEqual([
      betterMatchSeen.uid,
      worseMatchUnseen.uid,
    ]);
  });

  it('3. ranks higher priority first, and negatives last', () => {
    const high = c({ uid: 'what/posts/a', priority: 100 });
    const zero = c({ uid: 'what/posts/b' });
    const down = c({ uid: 'what/posts/c', priority: -100 });
    expect(uidsOf(rankCards([zero, down, high]))).toEqual([high.uid, zero.uid, down.uid]);
  });

  it('4. ranks unseen before seen', () => {
    const seen = c({ uid: 'what/posts/a' });
    const unseen = c({ uid: 'what/posts/b' });
    const isSeen = (card: RankableCard) => card.uid === seen.uid;
    expect(uidsOf(rankCards([seen, unseen], { isSeen }))).toEqual([unseen.uid, seen.uid]);
  });

  it('5. ranks by `order` — ascending, within one folder', () => {
    const first = c({ uid: 'what/posts/stories/arctic/z', order: 1 });
    const second = c({ uid: 'what/posts/stories/arctic/a', order: 2 });
    expect(uidsOf(rankCards([second, first]))).toEqual([first.uid, second.uid]);
  });

  it('5. does NOT apply `order` across folders — it is a within-folder sequence', () => {
    // An arctic chapter's `order: 1` says nothing about a puzzle. Both are in
    // different folders, so the chain falls through to uid.
    const chapter = c({ uid: 'what/posts/stories/arctic/z', order: 1 });
    const puzzle = c({ uid: 'what/puzzles/a', order: 9 });
    expect(uidsOf(rankCards([puzzle, chapter]))).toEqual([chapter.uid, puzzle.uid]);
  });

  it('6. applies the folder\'s declared sort between two of its cards', () => {
    const easy = c({ uid: 'what/puzzles/z', sort: { key: 'difficulty', direction: 'asc', value: 1 } });
    const hard = c({ uid: 'what/puzzles/a', sort: { key: 'difficulty', direction: 'asc', value: 5 } });
    expect(uidsOf(rankCards([hard, easy]))).toEqual([easy.uid, hard.uid]);
  });

  it('6. sorts a card missing the sort key last', () => {
    const rated = c({ uid: 'what/puzzles/z', sort: { key: 'difficulty', direction: 'asc', value: 3 } });
    const unrated = c({ uid: 'what/puzzles/a', sort: { key: 'difficulty', direction: 'asc' } });
    expect(uidsOf(rankCards([unrated, rated]))).toEqual([rated.uid, unrated.uid]);
  });

  it('6. does not fire across folders — results are not grouped by folder', () => {
    const late = c({ uid: 'what/posts/a', sort: { key: 'date', direction: 'desc', value: 2000 } });
    const early = c({ uid: 'what/puzzles/b', sort: { key: 'date', direction: 'desc', value: 1000 } });
    // Different folders, so uid decides: posts/a before puzzles/b.
    expect(uidsOf(rankCards([early, late]))).toEqual([late.uid, early.uid]);
  });

  it('7. falls back to uid, so the order is deterministic', () => {
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
  it('1 outranks 2: a better filter match beats a pinned unseen card', () => {
    const matchedSeen = c({ uid: 'what/posts/a', priority: 0 });
    const unmatchedUnseen = c({ uid: 'what/posts/b', priority: 500 });
    const matchCount = (card: RankableCard) => (card.uid === matchedSeen.uid ? 2 : 1);
    const isSeen = (card: RankableCard) => card.uid === matchedSeen.uid;
    expect(uidsOf(rankCards([unmatchedUnseen, matchedSeen], { matchCount, isSeen }))).toEqual([
      matchedSeen.uid,
      unmatchedUnseen.uid,
    ]);
  });

  it('2 outranks 3: a pinned unseen card wins over a higher-priority seen one', () => {
    // The whole point of the pin: a returning visitor with nothing unseen at
    // the top priority tier would otherwise see nothing but re-reads.
    const boostedButSeen = c({ uid: 'what/posts/a', priority: 100 });
    const unseen = c({ uid: 'what/posts/b' });
    const isSeen = (card: RankableCard) => card.uid === boostedButSeen.uid;
    expect(uidsOf(rankCards([unseen, boostedButSeen], { isSeen }))).toEqual([
      unseen.uid,
      boostedButSeen.uid,
    ]);
  });

  it('3 outranks 4: an authored boost still wins over a plain unseen card outside the pinned tier', () => {
    // Below the pinned tier, priority above seen-ness still holds (#68):
    // otherwise a boost quietly stops mattering to exactly the readers it was
    // aimed at. `pinnedUnseen` claims the top unseen priority tier only —
    // `plainUnseen` sits below it, so it competes on priority like any card.
    const boostedButSeen = c({ uid: 'what/posts/a', priority: 100 });
    const pinnedUnseen = c({ uid: 'what/posts/b', priority: 50 });
    const plainUnseen = c({ uid: 'what/posts/c', priority: -10 });
    const isSeen = (card: RankableCard) => card.uid === boostedButSeen.uid;
    expect(uidsOf(rankCards([plainUnseen, boostedButSeen, pinnedUnseen], { isSeen }))).toEqual([
      pinnedUnseen.uid,
      boostedButSeen.uid,
      plainUnseen.uid,
    ]);
  });

  it('4 outranks 5: unseen wins over a lower `order`', () => {
    const seenFirst = c({ uid: 'what/posts/stories/arctic/a', order: 1 });
    const unseenLater = c({ uid: 'what/posts/stories/arctic/b', order: 2 });
    const isSeen = (card: RankableCard) => card.uid === seenFirst.uid;
    expect(uidsOf(rankCards([seenFirst, unseenLater], { isSeen }))).toEqual([
      unseenLater.uid,
      seenFirst.uid,
    ]);
  });

  it('5 outranks 6: `order` wins over the folder\'s declared sort', () => {
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

  it('6 outranks 7: the folder sort wins over uid', () => {
    const newer = c({ uid: 'what/posts/z', sort: { key: 'date', direction: 'desc', value: 2000 } });
    const older = c({ uid: 'what/posts/a', sort: { key: 'date', direction: 'desc', value: 1000 } });
    expect(uidsOf(rankCards([older, newer]))).toEqual([newer.uid, older.uid]);
  });
});

// ---------------------------------------------------------------------------
// The seam: the comparator runs CLIENT-side, so every rung it reads has to be
// on the client payload, not just on CardMeta.
// ---------------------------------------------------------------------------

/**
 * Type-level guard. `keyof RankableCard` is the comparator's whole field list;
 * anything in it that SerialisedCard doesn't declare is a rung that reads
 * `undefined` in the browser. Assigning that leftover to `never` is a
 * `npm run check` failure naming the missing field — which is what issue #90
 * needed and didn't have: `order` was in the chain but not in the payload, and
 * an absent optional field is silently assignable, so a plain
 * `SerialisedCard extends RankableCard` check would have stayed green.
 */
type RungFieldsMissingFromPayload = Exclude<keyof RankableCard, keyof SerialisedCard>;
const _everyRungFieldCrossesTheWire: never = undefined as unknown as RungFieldsMissingFromPayload;
void _everyRungFieldCrossesTheWire;

describe('the ranking chain over SERIALISED cards', () => {
  /** A minimal CardMeta with no header image, so serialisation needs no assets. */
  function meta(overrides: Partial<CardMeta> & { uid: string }): CardMeta {
    return {
      title: overrides.uid,
      tags: [],
      renderer: 'card',
      contentHash: `hash:${overrides.uid}`,
      status: 'published',
      visibility: { listed: true, reachable: true },
      priority: 0,
      sort: { key: 'date', direction: 'desc' },
      ...overrides,
    };
  }

  // The runtime half of the guard: the type check proves the field is declared,
  // this proves it is actually PICKED and that rung 4 fires on the result. Both
  // cards tie on rungs 1-3 (no context, equal priority) and rung 5 actively
  // disagrees with `order`, so nothing but rung 4 can produce this ordering.
  it('4. `order` survives serialisation and still outranks the folder sort', async () => {
    const cards = await Promise.all([
      serialiseBrowseCard(meta({
        uid: 'what/posts/stories/arctic/a-last',
        order: 2,
        sort: { key: 'date', direction: 'desc', value: 2000 },
      })),
      serialiseBrowseCard(meta({
        uid: 'what/posts/stories/arctic/z-first',
        order: 1,
        sort: { key: 'date', direction: 'desc', value: 1000 },
      })),
    ]);

    expect(cards.map(card => card.order)).toEqual([2, 1]);
    expect(uidsOf(rankCards(cards))).toEqual([
      'what/posts/stories/arctic/z-first',
      'what/posts/stories/arctic/a-last',
    ]);
  });

  it('leaves `order` absent on a card that declares none', async () => {
    const card = await serialiseBrowseCard(meta({ uid: 'what/posts/unordered' }));
    expect(card.order).toBeUndefined();
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
