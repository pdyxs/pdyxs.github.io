import { describe, it, expect } from 'vitest';
import { pushToStack, removeFromStack, activateCard, replaceActiveSlot } from './card-stack-store';
import { cardEntry } from '../lib/stack-layout';
import type { StackState } from '../lib/stack-layout';

const emptyState: StackState = { entries: [], activeKey: null };

describe('pushToStack', () => {
  it('pushToStack_appends_and_activates: new entry is appended and set as activeKey', () => {
    const result = pushToStack(emptyState, cardEntry('about/me'));
    expect(result.entries).toEqual([{ key: 'about/me', uid: 'about/me' }]);
    expect(result.activeKey).toBe('about/me');
  });

  it('pushToStack appends to existing entries', () => {
    const state: StackState = { entries: [cardEntry('a')], activeKey: 'a' };
    const result = pushToStack(state, cardEntry('b'));
    expect(result.entries).toHaveLength(2);
    expect(result.entries[1]).toEqual({ key: 'b', uid: 'b' });
    expect(result.activeKey).toBe('b');
  });
});

describe('removeFromStack', () => {
  it('removeFromStack_activates_previous: removing active card activates the previous one', () => {
    const state: StackState = {
      entries: [cardEntry('a'), cardEntry('b')],
      activeKey: 'b',
    };
    const result = removeFromStack(state, 'b');
    expect(result.entries).toEqual([{ key: 'a', uid: 'a' }]);
    expect(result.activeKey).toBe('a');
  });

  it('removing the only card results in activeKey null', () => {
    const state: StackState = { entries: [cardEntry('a')], activeKey: 'a' };
    const result = removeFromStack(state, 'a');
    expect(result.entries).toEqual([]);
    expect(result.activeKey).toBeNull();
  });

  it('removing a non-active card does not change activeKey', () => {
    const state: StackState = {
      entries: [cardEntry('a'), cardEntry('b'), cardEntry('c')],
      activeKey: 'b',
    };
    const result = removeFromStack(state, 'a');
    expect(result.entries).toEqual([{ key: 'b', uid: 'b' }, { key: 'c', uid: 'c' }]);
    expect(result.activeKey).toBe('b');
  });
});

describe('activateCard', () => {
  it('activateCard_updates_activeKey: sets activeKey, leaves entries unchanged', () => {
    const state: StackState = {
      entries: [cardEntry('a'), cardEntry('b')],
      activeKey: 'a',
    };
    const result = activateCard(state, 'b');
    expect(result.entries).toEqual(state.entries);
    expect(result.activeKey).toBe('b');
  });
});

describe('replaceActiveSlot', () => {
  it('replaceActiveSlot_swaps_active: single-entry stack — entry and activeKey updated to newEntry', () => {
    const state: StackState = { entries: [cardEntry('stories/arctic/00')], activeKey: 'stories/arctic/00' };
    const result = replaceActiveSlot(state, cardEntry('stories/arctic/01'));
    expect(result.entries).toEqual([{ key: 'stories/arctic/01', uid: 'stories/arctic/01' }]);
    expect(result.activeKey).toBe('stories/arctic/01');
  });

  it('replaceActiveSlot_mid_stack: active entry in middle — only that slot swapped, order preserved', () => {
    const state: StackState = {
      entries: [cardEntry('tag/travel'), cardEntry('stories/arctic/00'), cardEntry('cards/who')],
      activeKey: 'stories/arctic/00',
    };
    const result = replaceActiveSlot(state, cardEntry('stories/arctic/01'));
    expect(result.entries).toEqual([
      { key: 'tag/travel', uid: 'tag/travel' },
      { key: 'stories/arctic/01', uid: 'stories/arctic/01' },
      { key: 'cards/who', uid: 'cards/who' },
    ]);
    expect(result.activeKey).toBe('stories/arctic/01');
  });

  it('replaceActiveSlot_noop_if_no_active: activeKey null — state returned unchanged', () => {
    const state: StackState = { entries: [cardEntry('stories/arctic/00')], activeKey: null };
    const result = replaceActiveSlot(state, cardEntry('stories/arctic/01'));
    expect(result).toBe(state);
  });

  it('replaceActiveSlot_noop_if_not_found: activeKey not in entries — state returned unchanged', () => {
    const state: StackState = { entries: [cardEntry('stories/arctic/00')], activeKey: 'stories/arctic/99' };
    const result = replaceActiveSlot(state, cardEntry('stories/arctic/01'));
    expect(result).toBe(state);
  });
});
