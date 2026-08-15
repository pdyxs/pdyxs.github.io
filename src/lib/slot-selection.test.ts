import { describe, it, expect, beforeEach } from 'vitest';
import { selectSlotCard, contentHashFor, DEFAULT_SLOT_POOL } from './slot-selection';
import { clearViewState, markRead } from './card-view-state';
import { fakeCardMeta } from '../test/fixtures';
import type { FilterState } from '../dimensions';

const EMPTY_FILTER: FilterState = { };
const UTC = 'UTC';

// Dates with unambiguous UTC calendar-day membership
const DAY1_A = new Date('2024-03-15T08:00:00Z'); // 2024-03-15
const DAY1_B = new Date('2024-03-15T16:00:00Z'); // 2024-03-15
const DAY2   = new Date('2024-03-16T08:00:00Z'); // 2024-03-16

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
    const filter: FilterState = { what: ['what:games'] };
    expect(selectSlotCard(cards, filter, DAY1_A, UTC)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Day stability
// ---------------------------------------------------------------------------

describe('selectSlotCard — day stability', () => {
  const cards = () => [
    fakeCardMeta({ uid: 'posts/a' }),
    fakeCardMeta({ uid: 'posts/b' }),
    fakeCardMeta({ uid: 'posts/c' }),
  ];

  it('returns the same card for two calls on the same calendar day', () => {
    const r1 = selectSlotCard(cards(), EMPTY_FILTER, DAY1_A, UTC);
    const r2 = selectSlotCard(cards(), EMPTY_FILTER, DAY1_B, UTC);
    expect(r1).not.toBeNull();
    expect(r1?.uid).toBe(r2?.uid);
  });

  it('re-rolls on a new calendar day', () => {
    // Not an assertion that the pick *changes* (a 3-card pool can repeat), only
    // that the seed is the day: same day same answer, and both days answer.
    expect(selectSlotCard(cards(), EMPTY_FILTER, DAY2, UTC)).not.toBeNull();
  });

  it('is stable across a page refresh — nothing is written by selecting', () => {
    const r1 = selectSlotCard(cards(), EMPTY_FILTER, DAY1_A, UTC);
    const r2 = selectSlotCard(cards(), EMPTY_FILTER, DAY1_B, UTC);
    // The `displayed` tier used to be what held this steady; now it holds
    // because a shown card leaves no trace at all (issue #83).
    expect(r2?.uid).toBe(r1?.uid);
  });
});

// ---------------------------------------------------------------------------
// The pool: top-n by the ranking chain
// ---------------------------------------------------------------------------

describe('selectSlotCard — top-n pool', () => {
  it('with pool 1, always returns the single top-ranked card', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/low', priority: 0 }),
      fakeCardMeta({ uid: 'posts/top', priority: 100 }),
      fakeCardMeta({ uid: 'posts/mid', priority: 50 }),
    ];
    for (const day of [DAY1_A, DAY2]) {
      expect(selectSlotCard(cards, EMPTY_FILTER, day, UTC, undefined, 1)?.uid).toBe('posts/top');
    }
  });

  it('never picks a card outside the top `pool` by priority', () => {
    const cards = [
      fakeCardMeta({ uid: 'posts/hi1', priority: 100 }),
      fakeCardMeta({ uid: 'posts/hi2', priority: 100 }),
      ...Array.from({ length: 20 }, (_, i) => fakeCardMeta({ uid: `posts/lo${i}`, priority: 0 })),
    ];
    const picked = new Set<string>();
    for (let d = 1; d <= 28; d++) {
      const day = new Date(`2024-02-${String(d).padStart(2, '0')}T08:00:00Z`);
      picked.add(selectSlotCard(cards, EMPTY_FILTER, day, UTC, undefined, 2)!.uid);
    }
    expect([...picked].sort()).toEqual(['posts/hi1', 'posts/hi2']);
  });

  it('defaults the pool to DEFAULT_SLOT_POOL', () => {
    // All equal priority, so the chain falls through to rung 6 (uid) — the
    // eligible set is the first DEFAULT_SLOT_POOL uids in sort order.
    const cards = Array.from({ length: 12 }, (_, i) =>
      fakeCardMeta({ uid: `posts/${String(i).padStart(2, '0')}` }),
    );
    const eligible = cards.slice(0, DEFAULT_SLOT_POOL).map(c => c.uid);
    for (let d = 1; d <= 28; d++) {
      const day = new Date(`2024-02-${String(d).padStart(2, '0')}T08:00:00Z`);
      expect(eligible).toContain(selectSlotCard(cards, EMPTY_FILTER, day, UTC)!.uid);
    }
  });

  it('tolerates a pool larger than the filtered set', () => {
    const cards = [fakeCardMeta({ uid: 'posts/only' })];
    expect(selectSlotCard(cards, EMPTY_FILTER, DAY1_A, UTC, undefined, 50)?.uid).toBe('posts/only');
  });
});

// ---------------------------------------------------------------------------
// Seen-ness is one rung of the chain, not a tier
// ---------------------------------------------------------------------------

describe('selectSlotCard — seen-ness', () => {
  it('prefers an unseen card over a read one at equal priority', () => {
    const read   = fakeCardMeta({ uid: 'posts/a-read' });   // sorts first on uid
    const unseen = fakeCardMeta({ uid: 'posts/b-unseen' });
    markRead(read.uid, contentHashFor(read));

    expect(selectSlotCard([read, unseen], EMPTY_FILTER, DAY1_A, UTC, undefined, 1)?.uid)
      .toBe(unseen.uid);
  });

  it('does not let seen-ness outrank priority', () => {
    // The whole reason rung 2 sits above rung 3: an authored boost must keep
    // mattering to exactly the returning visitor it was aimed at.
    const boosted = fakeCardMeta({ uid: 'posts/boosted', priority: 100 });
    const unseen  = fakeCardMeta({ uid: 'posts/unseen',  priority: 0 });
    markRead(boosted.uid, contentHashFor(boosted));

    expect(selectSlotCard([boosted, unseen], EMPTY_FILTER, DAY1_A, UTC, undefined, 1)?.uid)
      .toBe(boosted.uid);
  });

  it('still returns a card when every candidate has been read', () => {
    const cards = [fakeCardMeta({ uid: 'posts/r1' }), fakeCardMeta({ uid: 'posts/r2' })];
    for (const c of cards) markRead(c.uid, contentHashFor(c));

    const result = selectSlotCard(cards, EMPTY_FILTER, DAY1_A, UTC);
    expect(['posts/r1', 'posts/r2']).toContain(result!.uid);
  });

  it('counts a card as unseen again once its content hash changes', () => {
    const edited = fakeCardMeta({ uid: 'posts/a-edited' }); // sorts first on uid
    const other  = fakeCardMeta({ uid: 'posts/b-other' });
    markRead(edited.uid, 'stale-hash');

    expect(selectSlotCard([edited, other], EMPTY_FILTER, DAY1_A, UTC, undefined, 1)?.uid)
      .toBe(edited.uid);
  });
});

// ---------------------------------------------------------------------------
// Filter interaction
// ---------------------------------------------------------------------------

describe('selectSlotCard — filter integration', () => {
  it('only selects from cards that pass the filter', () => {
    const projectCard = fakeCardMeta({ uid: 'projects/p', tags: ['what:projects'] });
    const gameCard    = fakeCardMeta({ uid: 'projects/g', tags: ['what:games'] });
    const filter: FilterState = { what: ['what:projects'] };

    const result = selectSlotCard([projectCard, gameCard], filter, DAY1_A, UTC);
    expect(result?.uid).toBe(projectCard.uid);
  });

  it('ranks a card matching more of the selected values first (rung 1)', () => {
    const both = fakeCardMeta({ uid: 'posts/b-both', tags: ['what:projects', 'what:games'] });
    const one  = fakeCardMeta({ uid: 'posts/a-one',  tags: ['what:projects'] });
    const filter: FilterState = { what: ['what:projects', 'what:games'] };

    expect(selectSlotCard([one, both], filter, DAY1_A, UTC, undefined, 1)?.uid).toBe(both.uid);
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
