import { describe, it, expect } from 'vitest';
import {
  historyEmptyMessage,
  historyMode,
  seenCards,
  selectHistoryCards,
  unseenCards,
  type ReadHistory,
} from './history-lens';
import type { RankableCard } from './ranking';

/** A card in `what/posts` with nothing declared, unless overridden. */
function c(overrides: Partial<RankableCard> & { uid: string }): RankableCard {
  return { priority: 0, ...overrides };
}

const uidsOf = (cards: RankableCard[]) => cards.map(card => card.uid);

/**
 * A history from a plain uid -> readAt map. `null` records a card read before
 * #83 (read, at an unknown time); a uid absent from the map was never read.
 */
function history(entries: Record<string, string | null>): ReadHistory {
  return {
    hasRead: uid => uid in entries,
    readAt: uid => entries[uid] ?? null,
  };
}

describe('historyMode', () => {
  it('reads the mode out of a lens config, and is null for every other lens', () => {
    expect(historyMode({ readState: 'seen' })).toBe('seen');
    expect(historyMode({ readState: 'unseen' })).toBe('unseen');
    expect(historyMode({ sortKey: 'date' })).toBeNull();
    expect(historyMode(undefined)).toBeNull();
    expect(historyMode({ readState: 'read' })).toBeNull();
  });
});

describe('seenCards', () => {
  const a = c({ uid: 'what/posts/a' });
  const b = c({ uid: 'what/posts/b' });
  const never = c({ uid: 'what/posts/c' });

  it('keeps only read cards, most recently read first', () => {
    const h = history({
      'what/posts/a': '2026-08-01T10:00:00.000Z',
      'what/posts/b': '2026-08-10T10:00:00.000Z',
    });
    expect(uidsOf(seenCards([a, b, never], h))).toEqual([b.uid, a.uid]);
  });

  it('keeps a card read before readAt existed, sorted last', () => {
    // The cutover case: pre-#83 entries are reads with no timestamp. Dropping
    // them would empty every returning visitor's history on day one.
    const h = history({ 'what/posts/a': null, 'what/posts/b': '2026-08-10T10:00:00.000Z' });
    expect(uidsOf(seenCards([a, b, never], h))).toEqual([b.uid, a.uid]);
  });

  it('is empty for a visitor with no history', () => {
    expect(seenCards([a, b], history({}))).toEqual([]);
  });

  it('does not mutate its input', () => {
    const cards = [a, b];
    seenCards(cards, history({ 'what/posts/b': '2026-08-10T10:00:00.000Z' }));
    expect(uidsOf(cards)).toEqual([a.uid, b.uid]);
  });
});

describe('unseenCards', () => {
  it('drops read cards and ranks the rest by the shared chain', () => {
    const read = c({ uid: 'what/posts/a', priority: 500 });
    const boosted = c({ uid: 'what/posts/b', priority: 100 });
    const plain = c({ uid: 'what/posts/c' });
    const h = history({ 'what/posts/a': '2026-08-01T10:00:00.000Z' });
    expect(uidsOf(unseenCards([read, plain, boosted], h))).toEqual([boosted.uid, plain.uid]);
  });

  it('is empty once every card has been read', () => {
    const a = c({ uid: 'what/posts/a' });
    const h = history({ 'what/posts/a': null });
    expect(unseenCards([a], h)).toEqual([]);
  });
});

describe('a card read before the author edited it', () => {
  // The ruling (see the module header): both lenses key on uid ALONE, so an
  // edited card stays in Seen and stays out of Unseen. The hash-sensitive
  // "look again" signal lives in the ranking chain's rung 3, not here.
  const edited = c({ uid: 'what/posts/edited' });
  const h = history({ 'what/posts/edited': '2026-08-01T10:00:00.000Z' });

  it('is in Seen', () => {
    expect(uidsOf(selectHistoryCards([edited], 'seen', h))).toEqual([edited.uid]);
  });

  it('is not in Unseen', () => {
    expect(selectHistoryCards([edited], 'unseen', h)).toEqual([]);
  });

  it('so the two lenses partition the pool exactly', () => {
    const cards = [
      c({ uid: 'what/posts/a' }),
      c({ uid: 'what/posts/b' }),
      c({ uid: 'what/posts/c' }),
    ];
    const partial = history({ 'what/posts/b': '2026-08-10T10:00:00.000Z' });
    const seen = selectHistoryCards(cards, 'seen', partial);
    const unseen = selectHistoryCards(cards, 'unseen', partial);
    expect(seen.length + unseen.length).toBe(cards.length);
    expect(new Set([...uidsOf(seen), ...uidsOf(unseen)])).toEqual(new Set(uidsOf(cards)));
  });
});

describe('historyEmptyMessage', () => {
  it('tells a first-time visitor what Seen will collect', () => {
    const message = historyEmptyMessage('seen', { anyHistory: false, anyUnread: true });
    expect(message).toMatch(/as you open them/);
    expect(message).not.toMatch(/filter/);
  });

  it('blames the filters when the visitor does have history', () => {
    const message = historyEmptyMessage('seen', { anyHistory: true, anyUnread: true });
    expect(message).toMatch(/filters/);
  });

  it('congratulates a visitor who has read everything', () => {
    const message = historyEmptyMessage('unseen', { anyHistory: true, anyUnread: false });
    expect(message).toMatch(/every card on the site/);
    expect(message).not.toMatch(/filter/);
  });

  it('blames the filters when unread cards exist outside them', () => {
    const message = historyEmptyMessage('unseen', { anyHistory: true, anyUnread: true });
    expect(message).toMatch(/filters/);
  });
});
