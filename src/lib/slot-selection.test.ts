import { describe, it, expect, beforeEach } from 'vitest';
import { selectSlotCard, contentHashFor } from './slot-selection';
import { clearViewState, markDisplayed, markRead } from './card-view-state';
import { fakeCardMeta } from '../test/fixtures';
import type { FilterState } from './filters';

const EMPTY_FILTER: FilterState = { selections: {} };

// Dates in Sydney TZ that map to the same calendar day
// 2024-03-15 12:00 AEDT = 2024-03-15 01:00 UTC
const SYD_DAY1_A = new Date('2024-03-15T01:00:00Z'); // 12:00 AEDT same day
const SYD_DAY1_B = new Date('2024-03-15T10:00:00Z'); // 21:00 AEDT same day
// Next calendar day in Sydney: 2024-03-16
const SYD_DAY2 = new Date('2024-03-16T01:00:00Z');

beforeEach(() => {
  clearViewState();
});

// ---------------------------------------------------------------------------
// null return when no cards match
// ---------------------------------------------------------------------------

describe('selectSlotCard — empty / no match', () => {
  it('returns null when the card list is empty', () => {
    expect(selectSlotCard([], EMPTY_FILTER, SYD_DAY1_A)).toBeNull();
  });

  it('returns null when no cards pass the filter', () => {
    const cards = [fakeCardMeta({ uid: 'posts/a', tags: ['what:projects'] })];
    const filter: FilterState = { selections: { what: ['what:games'] } };
    expect(selectSlotCard(cards, filter, SYD_DAY1_A)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Day stability
// ---------------------------------------------------------------------------

describe('selectSlotCard — day stability', () => {
  it('returns the same card for two calls on the same Sydney calendar day', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a' }),
      fakeCardMeta({ uid: 'posts/b' }),
      fakeCardMeta({ uid: 'posts/c' }),
    ];
    const r1 = selectSlotCard(cards, EMPTY_FILTER, SYD_DAY1_A);
    const r2 = selectSlotCard(cards, EMPTY_FILTER, SYD_DAY1_B);
    expect(r1).not.toBeNull();
    expect(r1?.uid).toBe(r2?.uid);
  });

  it('may return a different card on the next Sydney calendar day', () => {
    // With 3 cards and two distinct seeds it is overwhelmingly likely they differ,
    // but we just assert both are non-null and both are from the cards set.
    const cards = [
      fakeCardMeta({ uid: 'posts/a' }),
      fakeCardMeta({ uid: 'posts/b' }),
      fakeCardMeta({ uid: 'posts/c' }),
    ];
    const uids = cards.map(c => c.uid);
    const r1 = selectSlotCard(cards, EMPTY_FILTER, SYD_DAY1_A);
    const r2 = selectSlotCard(cards, EMPTY_FILTER, SYD_DAY2);
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(uids).toContain(r1!.uid);
    expect(uids).toContain(r2!.uid);
    // Verify seeds are actually different (different date strings)
    // They *could* hash to the same index — just confirm both are valid cards.
  });
});

// ---------------------------------------------------------------------------
// Preference ordering
// ---------------------------------------------------------------------------

describe('selectSlotCard — preference ordering', () => {
  it('prefers unseen over displayed and read', () => {
    const unseenCard = fakeCardMeta({ uid: 'posts/unseen', title: 'Unseen' });
    const displayedCard = fakeCardMeta({ uid: 'posts/displayed', title: 'Displayed' });
    const readCard = fakeCardMeta({ uid: 'posts/read', title: 'Read' });

    markDisplayed(displayedCard.uid, contentHashFor(displayedCard));
    markRead(readCard.uid, contentHashFor(readCard));

    const cards = [displayedCard, readCard, unseenCard];
    const result = selectSlotCard(cards, EMPTY_FILTER, SYD_DAY1_A);
    expect(result?.uid).toBe(unseenCard.uid);
  });

  it('prefers displayed over read when no unseen cards remain', () => {
    const displayedCard = fakeCardMeta({ uid: 'posts/displayed', title: 'Displayed' });
    const readCard = fakeCardMeta({ uid: 'posts/read', title: 'Read' });

    markDisplayed(displayedCard.uid, contentHashFor(displayedCard));
    markRead(readCard.uid, contentHashFor(readCard));

    const cards = [readCard, displayedCard];
    const result = selectSlotCard(cards, EMPTY_FILTER, SYD_DAY1_A);
    expect(result?.uid).toBe(displayedCard.uid);
  });

  it('falls back to read when all cards are read', () => {
    const readCard1 = fakeCardMeta({ uid: 'posts/read1', title: 'Read1' });
    const readCard2 = fakeCardMeta({ uid: 'posts/read2', title: 'Read2' });

    markRead(readCard1.uid, contentHashFor(readCard1));
    markRead(readCard2.uid, contentHashFor(readCard2));

    const cards = [readCard1, readCard2];
    const result = selectSlotCard(cards, EMPTY_FILTER, SYD_DAY1_A);
    expect(result).not.toBeNull();
    expect([readCard1.uid, readCard2.uid]).toContain(result!.uid);
  });

  it('with multiple unseen cards, picks stably from the unseen tier only', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/u1', title: 'U1' }),
      fakeCardMeta({ uid: 'posts/u2', title: 'U2' }),
      fakeCardMeta({ uid: 'posts/u3', title: 'U3' }),
    ];
    // All unseen — same result across two calls same day
    const r1 = selectSlotCard(cards, EMPTY_FILTER, SYD_DAY1_A);
    const r2 = selectSlotCard(cards, EMPTY_FILTER, SYD_DAY1_B);
    expect(r1?.uid).toBe(r2?.uid);
  });
});

// ---------------------------------------------------------------------------
// Filter interaction
// ---------------------------------------------------------------------------

describe('selectSlotCard — filter integration', () => {
  it('only selects from cards that pass the filter', () => {
    const projectCard = fakeCardMeta({ uid: 'projects/p', tags: ['what:projects'] });
    const gameCard = fakeCardMeta({ uid: 'projects/g', tags: ['what:games'] });
    const filter: FilterState = { selections: { what: ['what:projects'] } };

    const result = selectSlotCard([projectCard, gameCard], filter, SYD_DAY1_A);
    expect(result?.uid).toBe(projectCard.uid);
  });
});
