import { describe, it, expect } from 'vitest';
import { expandCollapsedSeries, isSeriesRead, type SeriesMembersLookup } from '@browse/results/collapsed-series';

type Card = { uid: string; read?: boolean };

function card(uid: string): Card {
  return { uid };
}

/** A three-chapter series represented by its first chapter. */
const REP = 'series/00-intro';
function seriesMembers(): SeriesMembersLookup<Card> {
  return {
    [REP]: [card('series/00-intro'), card('series/01-middle'), card('series/02-end')],
  };
}

describe('isSeriesRead', () => {
  it('is false when no member has been read', () => {
    expect(isSeriesRead(card(REP), seriesMembers(), () => false)).toBe(false);
  });

  it('is true when ANY member has been read, not just the representative', () => {
    const isRead = (m: Card) => m.uid === 'series/01-middle';
    expect(isSeriesRead(card(REP), seriesMembers(), isRead)).toBe(true);
  });

  it('falls back to the card\'s own read state when it is not a collapsed representative', () => {
    const plain = card('what/posts/standalone');
    expect(isSeriesRead(plain, seriesMembers(), () => true)).toBe(true);
    expect(isSeriesRead(plain, seriesMembers(), () => false)).toBe(false);
  });
});

describe('expandCollapsedSeries', () => {
  it('leaves an ordinary card untouched', () => {
    const cards = [card('what/posts/standalone')];
    const { cards: out, readUids } = expandCollapsedSeries(cards, {}, () => false);
    expect(out).toEqual(cards);
    expect(readUids.size).toBe(0);
  });

  it('emits only the representative when nothing in the series has been read', () => {
    const cards = [card(REP)];
    const { cards: out, readUids } = expandCollapsedSeries(cards, seriesMembers(), () => false);
    expect(out.map(c => c.uid)).toEqual([REP]);
    expect(readUids.size).toBe(0);
  });

  it('adds a second entry for the first unread chapter once any member is read', () => {
    const isRead = (m: Card) => m.uid === 'series/00-intro';
    const { cards: out, readUids } = expandCollapsedSeries([card(REP)], seriesMembers(), isRead);
    expect(out.map(c => c.uid)).toEqual([REP, 'series/01-middle']);
    expect(readUids).toEqual(new Set([REP]));
  });

  it('advances the second entry as earlier chapters are read', () => {
    const isRead = (m: Card) => m.uid === 'series/00-intro' || m.uid === 'series/01-middle';
    const { cards: out } = expandCollapsedSeries([card(REP)], seriesMembers(), isRead);
    expect(out.map(c => c.uid)).toEqual([REP, 'series/02-end']);
  });

  it('emits only the representative, marked read, once every chapter is read', () => {
    const { cards: out, readUids } = expandCollapsedSeries([card(REP)], seriesMembers(), () => true);
    expect(out.map(c => c.uid)).toEqual([REP]);
    expect(readUids).toEqual(new Set([REP]));
  });

  it('is a fresh live computation each call — editing the read predicate changes the result', () => {
    // The whole reason this isn't a stored/propagated fact (see the module
    // comment): if the specific chapter that was read is later "unread" (e.g.
    // its own hash-aware check reverts after an edit), the series must revert
    // too, with no stale state left over anywhere.
    let readUid = 'series/00-intro';
    const isRead = (m: Card) => m.uid === readUid;
    const first = expandCollapsedSeries([card(REP)], seriesMembers(), isRead);
    expect(first.readUids.has(REP)).toBe(true);

    readUid = 'nothing-matches';
    const second = expandCollapsedSeries([card(REP)], seriesMembers(), isRead);
    expect(second.readUids.has(REP)).toBe(false);
    expect(second.cards.map(c => c.uid)).toEqual([REP]);
  });

  it('preserves the surrounding list order when expanding one of several cards', () => {
    const isRead = (m: Card) => m.uid === 'series/00-intro';
    const cards = [card('before'), card(REP), card('after')];
    const { cards: out } = expandCollapsedSeries(cards, seriesMembers(), isRead);
    expect(out.map(c => c.uid)).toEqual(['before', REP, 'series/01-middle', 'after']);
  });
});
