import { describe, it, expect } from 'vitest';
import { pushToStack, removeFromStack, activateCard, replaceActiveSlot } from './card-stack-store';
import type { StackState } from '../lib/stack-layout';

const emptyState: StackState = { cards: [], activeUid: null };

describe('pushToStack', () => {
  it('pushToStack_appends_and_activates: new uid is appended and set as activeUid', () => {
    const result = pushToStack(emptyState, 'about/me');
    expect(result.cards).toEqual([{ uid: 'about/me' }]);
    expect(result.activeUid).toBe('about/me');
  });

  it('pushToStack appends to existing cards', () => {
    const state: StackState = { cards: [{ uid: 'a' }], activeUid: 'a' };
    const result = pushToStack(state, 'b');
    expect(result.cards).toHaveLength(2);
    expect(result.cards[1]).toEqual({ uid: 'b' });
    expect(result.activeUid).toBe('b');
  });
});

describe('removeFromStack', () => {
  it('removeFromStack_activates_previous: removing active card activates the previous one', () => {
    const state: StackState = {
      cards: [{ uid: 'a' }, { uid: 'b' }],
      activeUid: 'b',
    };
    const result = removeFromStack(state, 'b');
    expect(result.cards).toEqual([{ uid: 'a' }]);
    expect(result.activeUid).toBe('a');
  });

  it('removing the only card results in activeUid null', () => {
    const state: StackState = { cards: [{ uid: 'a' }], activeUid: 'a' };
    const result = removeFromStack(state, 'a');
    expect(result.cards).toEqual([]);
    expect(result.activeUid).toBeNull();
  });

  it('removing a non-active card does not change activeUid', () => {
    const state: StackState = {
      cards: [{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }],
      activeUid: 'b',
    };
    const result = removeFromStack(state, 'a');
    expect(result.cards).toEqual([{ uid: 'b' }, { uid: 'c' }]);
    expect(result.activeUid).toBe('b');
  });
});

describe('activateCard', () => {
  it('activateCard_updates_activeUid: sets activeUid, leaves cards unchanged', () => {
    const state: StackState = {
      cards: [{ uid: 'a' }, { uid: 'b' }],
      activeUid: 'a',
    };
    const result = activateCard(state, 'b');
    expect(result.cards).toEqual(state.cards);
    expect(result.activeUid).toBe('b');
  });
});

describe('replaceActiveSlot', () => {
  it('replaceActiveSlot_swaps_active: single-card stack — uid and activeUid updated to newUid', () => {
    const state: StackState = { cards: [{ uid: 'stories/arctic/00' }], activeUid: 'stories/arctic/00' };
    const result = replaceActiveSlot(state, 'stories/arctic/01');
    expect(result.cards).toEqual([{ uid: 'stories/arctic/01' }]);
    expect(result.activeUid).toBe('stories/arctic/01');
  });

  it('replaceActiveSlot_mid_stack: active card in middle — only that slot swapped, order preserved', () => {
    const state: StackState = {
      cards: [{ uid: 'tag/travel' }, { uid: 'stories/arctic/00' }, { uid: 'cards/who' }],
      activeUid: 'stories/arctic/00',
    };
    const result = replaceActiveSlot(state, 'stories/arctic/01');
    expect(result.cards).toEqual([
      { uid: 'tag/travel' },
      { uid: 'stories/arctic/01' },
      { uid: 'cards/who' },
    ]);
    expect(result.activeUid).toBe('stories/arctic/01');
  });

  it('replaceActiveSlot_noop_if_no_active: activeUid null — state returned unchanged', () => {
    const state: StackState = { cards: [{ uid: 'stories/arctic/00' }], activeUid: null };
    const result = replaceActiveSlot(state, 'stories/arctic/01');
    expect(result).toBe(state);
  });

  it('replaceActiveSlot_noop_if_not_found: activeUid not in cards — state returned unchanged', () => {
    const state: StackState = { cards: [{ uid: 'stories/arctic/00' }], activeUid: 'stories/arctic/99' };
    const result = replaceActiveSlot(state, 'stories/arctic/01');
    expect(result).toBe(state);
  });
});
