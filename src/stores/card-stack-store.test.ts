import { describe, it, expect } from 'vitest';
import { seedStackState, pushToStack, removeFromStack, activateCard, replaceActiveSlot, rekeyEntry } from './card-stack-store';
import { activeEntry, cardEntry, lensEntry } from '../lib/stack-layout';
import { geometryFor, STACK_GEOMETRY } from '../lib/stack-geometry';
import type { StackState } from '../lib/stack-layout';

const emptyState: StackState = { entries: [], activeSlot: null };

describe('pushToStack', () => {
  it('pushToStack_appends_and_activates: new entry is appended and set as the active slot', () => {
    const result = pushToStack(emptyState, cardEntry('about/me'));
    expect(result.entries).toEqual([{ key: 'about/me', uid: 'about/me', slot: 'about/me' }]);
    expect(result.activeSlot).toBe('about/me');
  });

  it('pushToStack appends to existing entries', () => {
    const state: StackState = { entries: [cardEntry('a')], activeSlot: 'a' };
    const result = pushToStack(state, cardEntry('b'));
    expect(result.entries).toHaveLength(2);
    expect(result.entries[1]).toEqual({ key: 'b', uid: 'b', slot: 'b' });
    expect(result.activeSlot).toBe('b');
  });
});

describe('removeFromStack', () => {
  it('removeFromStack_activates_previous: removing active card activates the previous one', () => {
    const state: StackState = {
      entries: [cardEntry('a'), cardEntry('b')],
      activeSlot: 'b',
    };
    const result = removeFromStack(state, 'b');
    expect(result.entries).toEqual([{ key: 'a', uid: 'a', slot: 'a' }]);
    expect(result.activeSlot).toBe('a');
  });

  it('removing the only card leaves no active slot', () => {
    const state: StackState = { entries: [cardEntry('a')], activeSlot: 'a' };
    const result = removeFromStack(state, 'a');
    expect(result.entries).toEqual([]);
    expect(result.activeSlot).toBeNull();
  });

  it('removing a non-active card does not change the active slot', () => {
    const state: StackState = {
      entries: [cardEntry('a'), cardEntry('b'), cardEntry('c')],
      activeSlot: 'b',
    };
    const result = removeFromStack(state, 'a');
    expect(result.entries).toEqual([{ key: 'b', uid: 'b', slot: 'b' }, { key: 'c', uid: 'c', slot: 'c' }]);
    expect(result.activeSlot).toBe('b');
  });
});

describe('activateCard', () => {
  it('activateCard_updates_active: sets the active slot, leaves entries unchanged', () => {
    const state: StackState = {
      entries: [cardEntry('a'), cardEntry('b')],
      activeSlot: 'a',
    };
    const result = activateCard(state, 'b');
    expect(result.entries).toEqual(state.entries);
    expect(result.activeSlot).toBe('b');
  });
});

describe('replaceActiveSlot', () => {
  it('replaceActiveSlot_swaps_active: single-entry stack — entry and active slot updated to newEntry', () => {
    const state: StackState = { entries: [cardEntry('stories/arctic/00')], activeSlot: 'stories/arctic/00' };
    const result = replaceActiveSlot(state, cardEntry('stories/arctic/01'));
    expect(result.entries).toEqual([{ key: 'stories/arctic/01', uid: 'stories/arctic/01', slot: 'stories/arctic/01' }]);
    expect(result.activeSlot).toBe('stories/arctic/01');
  });

  it('replaceActiveSlot_mid_stack: active entry in middle — only that slot swapped, order preserved', () => {
    const state: StackState = {
      entries: [cardEntry('tag/travel'), cardEntry('stories/arctic/00'), cardEntry('cards/who')],
      activeSlot: 'stories/arctic/00',
    };
    const result = replaceActiveSlot(state, cardEntry('stories/arctic/01'));
    expect(result.entries).toEqual([
      { key: 'tag/travel', uid: 'tag/travel', slot: 'tag/travel' },
      { key: 'stories/arctic/01', uid: 'stories/arctic/01', slot: 'stories/arctic/01' },
      { key: 'cards/who', uid: 'cards/who', slot: 'cards/who' },
    ]);
    expect(result.activeSlot).toBe('stories/arctic/01');
  });

  it('replaceActiveSlot_noop_if_no_active: no active slot — state returned unchanged', () => {
    const state: StackState = { entries: [cardEntry('stories/arctic/00')], activeSlot: null };
    const result = replaceActiveSlot(state, cardEntry('stories/arctic/01'));
    expect(result).toBe(state);
  });

  it('replaceActiveSlot_noop_if_not_found: active slot not in entries — state returned unchanged', () => {
    const state: StackState = { entries: [cardEntry('stories/arctic/00')], activeSlot: 'stories/arctic/99' };
    const result = replaceActiveSlot(state, cardEntry('stories/arctic/01'));
    expect(result).toBe(state);
  });
});

describe('rekeyEntry', () => {
  // Editing a lens's filters changes what the location IS, but not which DOM
  // node and cached fragment it occupies (issue #100).
  const home = cardEntry('posts/hello');
  const lens = lensEntry('interesting');

  it('re-identifies the entry at a handle and keeps the handle', () => {
    const state: StackState = { entries: [home, lens], activeSlot: lens.key };
    const next = rekeyEntry(state, 'lens/interesting', 'lens/interesting?filter.what=puzzles');
    expect(next.entries[1]).toEqual({
      key: 'lens/interesting?filter.what=puzzles',
      uid: 'lens/interesting',
      slot: 'lens/interesting',
    });
    expect(next.entries[0]).toBe(home);
  });

  it('keeps the active entry active through its own re-key', () => {
    // Nothing to follow any more (issue #106): the active entry is addressed
    // by slot, and a re-key deliberately leaves the slot where it was.
    const state: StackState = { entries: [lens], activeSlot: lens.slot };
    const next = rekeyEntry(state, 'lens/interesting', 'lens/interesting?filter.what=puzzles');
    expect(next.activeSlot).toBe('lens/interesting');
    expect(activeEntry(next)!.key).toBe('lens/interesting?filter.what=puzzles');
  });

  it('leaves the active entry alone when some other entry is re-keyed', () => {
    const state: StackState = { entries: [lens, home], activeSlot: home.slot };
    const next = rekeyEntry(state, 'lens/interesting', 'lens/interesting?filter.what=puzzles');
    expect(next.activeSlot).toBe('posts/hello');
  });

  it('is a no-op for an unknown handle or an unchanged key', () => {
    const state: StackState = { entries: [lens], activeSlot: lens.slot };
    expect(rekeyEntry(state, 'lens/nope', 'lens/x')).toBe(state);
    expect(rekeyEntry(state, 'lens/interesting', lens.key)).toBe(state);
  });
});

describe('rekeyEntry collisions (#106)', () => {
  // Clear the filters on the second view of a lens and it becomes the
  // unfiltered view already sitting behind it. Both entries stay: a stack is
  // the path you walked, and a path that passes the same place twice is normal.
  const plain = lensEntry('interesting');
  const filtered = { ...lensEntry('interesting', [['filter.what', 'puzzles']]), slot: 'lens/interesting#2' };
  const collided: StackState = { entries: [plain, filtered], activeSlot: filtered.slot };

  it('keeps both entries when a re-key lands on an identity another entry holds', () => {
    const next = rekeyEntry(collided, 'lens/interesting#2', 'lens/interesting');
    expect(next.entries).toEqual([
      { key: 'lens/interesting', uid: 'lens/interesting', slot: 'lens/interesting' },
      { key: 'lens/interesting', uid: 'lens/interesting', slot: 'lens/interesting#2' },
    ]);
  });

  it('leaves the visitor on the entry they were editing, not the one behind it', () => {
    // The whole reason addressing moved off `key`: with two identical keys, a
    // findIndex by key resolves to entry 0 — the one further back in the stack.
    const next = rekeyEntry(collided, 'lens/interesting#2', 'lens/interesting');
    expect(next.activeSlot).toBe('lens/interesting#2');
    expect(next.entries.indexOf(activeEntry(next)!)).toBe(1);
  });

  it('the geometry still places exactly one active card, and it is the right one', () => {
    const next = rekeyEntry(collided, 'lens/interesting#2', 'lens/interesting');
    const { cards } = geometryFor(next, { ...STACK_GEOMETRY, activeWidth: 680 });
    const active = cards.filter(c => c.role === 'active');
    expect(active).toHaveLength(1);
    expect(active[0].slot).toBe('lens/interesting#2');
  });
});

describe('seedStackState', () => {
  it('seeds the sole active entry when the render has an active location', () => {
    expect(seedStackState(cardEntry('about/me'))).toEqual({
      entries: [{ key: 'about/me', uid: 'about/me', slot: 'about/me' }],
      activeSlot: 'about/me',
    });
  });

  it('seeds the EMPTY stack when the render has none (#102)', () => {
    // Not "leave the store alone": the store is module-level and every page is
    // prerendered in one process, so an absent active location has to be
    // written, or the page inherits the previous one's stack.
    expect(seedStackState(null)).toEqual({ entries: [], activeSlot: null });
  });

  it('hands out a fresh object each time, never a shared empty state', () => {
    const a = seedStackState(null);
    const b = seedStackState(null);
    expect(a).not.toBe(b);
    a.entries.push(cardEntry('about/me'));
    expect(b.entries).toEqual([]);
  });

  it('replaces, rather than merges with, whatever the state was', () => {
    // The seed is a total statement of the initial stack — a two-entry stack
    // from the previous render leaves nothing behind.
    const previous = pushToStack({ entries: [cardEntry('a')], activeSlot: 'a' }, lensEntry('home'));
    expect(previous.entries).toHaveLength(2);
    expect(seedStackState(null).entries).toEqual([]);
  });
});
