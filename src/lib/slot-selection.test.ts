import { describe, it, expect, beforeEach } from 'vitest';
import { selectSlotCard, contentHashFor } from './slot-selection';
import { clearViewState, markDisplayed, markRead } from './card-view-state';
import { fakeCardMeta } from '../test/fixtures';
import type { FilterState } from './filters';

const EMPTY_FILTER: FilterState = { selections: {} };
const UTC = 'UTC';

// Dates with unambiguous UTC calendar-day membership
const DAY1_A = new Date('2024-03-15T08:00:00Z'); // 2024-03-15
const DAY1_B = new Date('2024-03-15T16:00:00Z'); // 2024-03-15
const DAY2   = new Date('2024-03-16T08:00:00Z'); // 2024-03-16

const DAY1_STR = '2024-03-15'; // YYYY-MM-DD for markDisplayed
const DAY2_STR = '2024-03-16';

beforeEach(() => {
  clearViewState();
});

// ---------------------------------------------------------------------------
// null return when no cards match
// ---------------------------------------------------------------------------

describe('selectSlotCard — empty / no match', () => {
  it('returns null when the card list is empty', () => {
    expect(selectSlotCard([], EMPTY_FILTER, DAY1_A, UTC)).toBeNull();
  });

  it('returns null when no cards pass the filter', () => {
    const cards = [fakeCardMeta({ uid: 'posts/a', tags: ['what:projects'] })];
    const filter: FilterState = { selections: { what: ['what:games'] } };
    expect(selectSlotCard(cards, filter, DAY1_A, UTC)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Day stability
// ---------------------------------------------------------------------------

describe('selectSlotCard — day stability', () => {
  it('returns the same card for two calls on the same calendar day', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a' }),
      fakeCardMeta({ uid: 'posts/b' }),
      fakeCardMeta({ uid: 'posts/c' }),
    ];
    const r1 = selectSlotCard(cards, EMPTY_FILTER, DAY1_A, UTC);
    const r2 = selectSlotCard(cards, EMPTY_FILTER, DAY1_B, UTC);
    expect(r1).not.toBeNull();
    expect(r1?.uid).toBe(r2?.uid);
  });

  it('may return a different card on the next calendar day', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a' }),
      fakeCardMeta({ uid: 'posts/b' }),
      fakeCardMeta({ uid: 'posts/c' }),
    ];
    const uids = cards.map(c => c.uid);
    const r1 = selectSlotCard(cards, EMPTY_FILTER, DAY1_A, UTC);
    const r2 = selectSlotCard(cards, EMPTY_FILTER, DAY2, UTC);
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(uids).toContain(r1!.uid);
    expect(uids).toContain(r2!.uid);
  });
});

// ---------------------------------------------------------------------------
// Preference ordering
// ---------------------------------------------------------------------------

describe('selectSlotCard — preference ordering', () => {
  it('prefers displayed (today) over unseen and read', () => {
    const unseenCard    = fakeCardMeta({ uid: 'posts/unseen',    title: 'Unseen' });
    const displayedCard = fakeCardMeta({ uid: 'posts/displayed', title: 'Displayed' });
    const readCard      = fakeCardMeta({ uid: 'posts/read',      title: 'Read' });

    markDisplayed(displayedCard.uid, contentHashFor(displayedCard), DAY1_STR);
    markRead(readCard.uid, contentHashFor(readCard));

    const result = selectSlotCard([displayedCard, readCard, unseenCard], EMPTY_FILTER, DAY1_A, UTC);
    expect(result?.uid).toBe(displayedCard.uid);
  });

  it('picks from unseen when nothing has been displayed today', () => {
    const unseenCard = fakeCardMeta({ uid: 'posts/unseen', title: 'Unseen' });
    const readCard   = fakeCardMeta({ uid: 'posts/read',   title: 'Read' });

    markRead(readCard.uid, contentHashFor(readCard));

    const result = selectSlotCard([readCard, unseenCard], EMPTY_FILTER, DAY1_A, UTC);
    expect(result?.uid).toBe(unseenCard.uid);
  });

  it('prefers displayed (same day) over read when no unseen remain', () => {
    const displayedCard = fakeCardMeta({ uid: 'posts/displayed', title: 'Displayed' });
    const readCard      = fakeCardMeta({ uid: 'posts/read',      title: 'Read' });

    markDisplayed(displayedCard.uid, contentHashFor(displayedCard), DAY1_STR);
    markRead(readCard.uid, contentHashFor(readCard));

    const result = selectSlotCard([readCard, displayedCard], EMPTY_FILTER, DAY1_A, UTC);
    expect(result?.uid).toBe(displayedCard.uid);
  });

  it('falls back to read when all cards are read', () => {
    const readCard1 = fakeCardMeta({ uid: 'posts/read1', title: 'Read1' });
    const readCard2 = fakeCardMeta({ uid: 'posts/read2', title: 'Read2' });

    markRead(readCard1.uid, contentHashFor(readCard1));
    markRead(readCard2.uid, contentHashFor(readCard2));

    const result = selectSlotCard([readCard1, readCard2], EMPTY_FILTER, DAY1_A, UTC);
    expect(result).not.toBeNull();
    expect([readCard1.uid, readCard2.uid]).toContain(result!.uid);
  });

  it('with multiple unseen cards, picks stably from the unseen tier only', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/u1', title: 'U1' }),
      fakeCardMeta({ uid: 'posts/u2', title: 'U2' }),
      fakeCardMeta({ uid: 'posts/u3', title: 'U3' }),
    ];
    const r1 = selectSlotCard(cards, EMPTY_FILTER, DAY1_A, UTC);
    const r2 = selectSlotCard(cards, EMPTY_FILTER, DAY1_B, UTC);
    expect(r1?.uid).toBe(r2?.uid);
  });

  it('returns the same card on subsequent calls after markDisplayed (simulates page refresh)', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/u1', title: 'U1' }),
      fakeCardMeta({ uid: 'posts/u2', title: 'U2' }),
      fakeCardMeta({ uid: 'posts/u3', title: 'U3' }),
    ];
    const r1 = selectSlotCard(cards, EMPTY_FILTER, DAY1_A, UTC);
    expect(r1).not.toBeNull();
    // Simulate what FrontPage does after selecting: mark it displayed
    markDisplayed(r1!.uid, contentHashFor(r1!), DAY1_STR);
    // Refresh — should return the same card
    const r2 = selectSlotCard(cards, EMPTY_FILTER, DAY1_B, UTC);
    expect(r2?.uid).toBe(r1?.uid);
  });
});

// ---------------------------------------------------------------------------
// Displayed-card day boundary
// ---------------------------------------------------------------------------

describe('selectSlotCard — displayed card day boundary', () => {
  it('cards displayed today remain in the displayed tier', () => {
    const displayedCard = fakeCardMeta({ uid: 'posts/displayed', title: 'Displayed' });
    const readCard      = fakeCardMeta({ uid: 'posts/read',      title: 'Read' });

    markDisplayed(displayedCard.uid, contentHashFor(displayedCard), DAY1_STR);
    markRead(readCard.uid, contentHashFor(readCard));

    const result = selectSlotCard([readCard, displayedCard], EMPTY_FILTER, DAY1_A, UTC);
    expect(result?.uid).toBe(displayedCard.uid);
  });

  it('cards displayed on a prior day fall to the read tier', () => {
    const displayedCard = fakeCardMeta({ uid: 'posts/displayed', title: 'Displayed' });
    const unseenCard    = fakeCardMeta({ uid: 'posts/unseen',    title: 'Unseen' });

    markDisplayed(displayedCard.uid, contentHashFor(displayedCard), DAY1_STR); // displayed yesterday

    // On DAY2, displayedCard should fall to read tier; unseenCard should be preferred
    const result = selectSlotCard([displayedCard, unseenCard], EMPTY_FILTER, DAY2, UTC);
    expect(result?.uid).toBe(unseenCard.uid);
  });

  it('all-displayed-prior-day falls back to the read tier pool', () => {
    const card1 = fakeCardMeta({ uid: 'posts/c1', title: 'C1' });
    const card2 = fakeCardMeta({ uid: 'posts/c2', title: 'C2' });

    markDisplayed(card1.uid, contentHashFor(card1), DAY1_STR);
    markDisplayed(card2.uid, contentHashFor(card2), DAY1_STR);

    // Both displayed yesterday — should still pick one (read-tier fallback)
    const result = selectSlotCard([card1, card2], EMPTY_FILTER, DAY2, UTC);
    expect(result).not.toBeNull();
    expect([card1.uid, card2.uid]).toContain(result!.uid);
  });
});

// ---------------------------------------------------------------------------
// Filter interaction
// ---------------------------------------------------------------------------

describe('selectSlotCard — filter integration', () => {
  it('only selects from cards that pass the filter', () => {
    const projectCard = fakeCardMeta({ uid: 'projects/p', tags: ['what:projects'] });
    const gameCard    = fakeCardMeta({ uid: 'projects/g', tags: ['what:games'] });
    const filter: FilterState = { selections: { what: ['what:projects'] } };

    const result = selectSlotCard([projectCard, gameCard], filter, DAY1_A, UTC);
    expect(result?.uid).toBe(projectCard.uid);
  });
});

// ---------------------------------------------------------------------------
// Sydney TZ explicit test
// ---------------------------------------------------------------------------

describe('selectSlotCard — Sydney TZ (explicit)', () => {
  const SYD = 'Australia/Sydney';
  // 2024-03-15 in AEDT (UTC+11): 2024-03-14T13:00Z to 2024-03-15T13:00Z
  const SYD_DAY1_A = new Date('2024-03-15T01:00:00Z'); // 12:00 AEDT
  const SYD_DAY1_B = new Date('2024-03-15T10:00:00Z'); // 21:00 AEDT — same Sydney day

  it('returns the same card for two times on the same Sydney calendar day', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/a' }),
      fakeCardMeta({ uid: 'posts/b' }),
      fakeCardMeta({ uid: 'posts/c' }),
    ];
    const r1 = selectSlotCard(cards, EMPTY_FILTER, SYD_DAY1_A, SYD);
    const r2 = selectSlotCard(cards, EMPTY_FILTER, SYD_DAY1_B, SYD);
    expect(r1).not.toBeNull();
    expect(r1?.uid).toBe(r2?.uid);
  });
});
