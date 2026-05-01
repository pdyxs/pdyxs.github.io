import { describe, it, expect } from 'vitest';
import { computeStackLayout } from './stack-layout';
import type { StackState, RenderItem } from './stack-layout';

describe('computeStackLayout', () => {
  it('zero_cards: empty state returns empty result', () => {
    const state: StackState = { cards: [], activeUid: null };
    const result = computeStackLayout(state);
    expect(result.visible).toEqual([]);
    expect(result.overflowUids).toEqual([]);
    expect(result.needsOverflow).toBe(false);
  });

  it('single_active_card: one card matching activeUid', () => {
    const state: StackState = { cards: [{ uid: 'about/me' }], activeUid: 'about/me' };
    const result = computeStackLayout(state);
    expect(result.visible).toHaveLength(1);
    expect(result.visible[0]).toMatchObject({
      uid: 'about/me',
      stackIndex: 0,
      isActive: true,
      isCollapsed: false,
    });
    expect(result.overflowUids).toEqual([]);
    expect(result.needsOverflow).toBe(false);
  });

  it('multiple_cards_active_in_middle: active has isActive, others isCollapsed', () => {
    const state: StackState = {
      cards: [{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }],
      activeUid: 'b',
    };
    const result = computeStackLayout(state);
    expect(result.visible).toHaveLength(3);
    const a = result.visible.find(c => c.uid === 'a')!;
    const b = result.visible.find(c => c.uid === 'b')!;
    const c = result.visible.find(c => c.uid === 'c')!;
    expect(a.isActive).toBe(false);
    expect(a.isCollapsed).toBe(true);
    expect(b.isActive).toBe(true);
    expect(b.isCollapsed).toBe(false);
    expect(c.isActive).toBe(false);
    expect(c.isCollapsed).toBe(true);
  });

  it('overflow_threshold: cards exceeding visible limit produce overflowUids', () => {
    const cards = Array.from({ length: 10 }, (_, i) => ({ uid: `card-${i}` }));
    const state: StackState = { cards, activeUid: 'card-9' };
    const result = computeStackLayout(state);
    expect(result.needsOverflow).toBe(true);
    expect(result.overflowUids.length).toBeGreaterThan(0);
    expect(result.visible.length + result.overflowUids.length).toBe(10);
  });

  // ── renderItems tests ──────────────────────────────────────────────────

  it('renderItems_no_overflow_active_last: 2 left-collapsed + active → fan-corner before each left slot', () => {
    const state: StackState = {
      cards: [{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }],
      activeUid: 'c',
    };
    const result = computeStackLayout(state);
    expect(result.numLeftCollapsed).toBe(2);
    expect(result.renderItems).toHaveLength(5); // fc, card-a, fc, card-b, card-c
    expect(result.renderItems[0]).toMatchObject({ kind: 'fan-corner', forUid: 'a', i: 0, n: 2 });
    expect(result.renderItems[1]).toMatchObject({ kind: 'card', uid: 'a', side: 'left', stackIndex: 0 });
    expect(result.renderItems[2]).toMatchObject({ kind: 'fan-corner', forUid: 'b', i: 1, n: 2 });
    expect(result.renderItems[3]).toMatchObject({ kind: 'card', uid: 'b', side: 'left', stackIndex: 1 });
    expect(result.renderItems[4]).toMatchObject({ kind: 'card', uid: 'c', side: 'active' });
  });

  it('renderItems_no_overflow_active_middle: 1 left + active + 1 right → fan-corner on left only', () => {
    const state: StackState = {
      cards: [{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }],
      activeUid: 'b',
    };
    const result = computeStackLayout(state);
    expect(result.numLeftCollapsed).toBe(1);
    expect(result.renderItems).toHaveLength(4); // fc, card-a, card-b, card-c
    expect(result.renderItems[0]).toMatchObject({ kind: 'fan-corner', forUid: 'a', i: 0, n: 1 });
    expect(result.renderItems[1]).toMatchObject({ kind: 'card', uid: 'a', side: 'left', stackIndex: 0 });
    expect(result.renderItems[2]).toMatchObject({ kind: 'card', uid: 'b', side: 'active' });
    expect(result.renderItems[3]).toMatchObject({ kind: 'card', uid: 'c', side: 'right' });
  });

  it('renderItems_overflow_left_only: 5 left-collapsed + active → overflow-left between anchors', () => {
    // cards: [a, b, c, d, e, f], active=f → L=5, R=0
    const cards = ['a', 'b', 'c', 'd', 'e', 'f'].map(uid => ({ uid }));
    const state: StackState = { cards, activeUid: 'f' };
    const result = computeStackLayout(state);
    expect(result.numLeftCollapsed).toBe(3);
    expect(result.needsOverflow).toBe(true);
    // renderItems: [fc{a}, card-a, fc{overflow-left}, overflow-left, fc{e}, card-e, card-f]
    expect(result.renderItems).toHaveLength(7);
    expect(result.renderItems[0]).toMatchObject({ kind: 'fan-corner', forUid: 'a', i: 0, n: 3 });
    expect(result.renderItems[1]).toMatchObject({ kind: 'card', uid: 'a', side: 'left', stackIndex: 0 });
    expect(result.renderItems[2]).toMatchObject({ kind: 'fan-corner', forUid: 'overflow-left', i: 1, n: 3 });
    expect(result.renderItems[3]).toMatchObject({ kind: 'overflow', side: 'left', stackIndex: 1 });
    const overflowItem = result.renderItems[3] as Extract<RenderItem, { kind: 'overflow' }>;
    expect(overflowItem.hiddenUids).toEqual(['b', 'c', 'd']);
    expect(result.renderItems[4]).toMatchObject({ kind: 'fan-corner', forUid: 'e', i: 2, n: 3 });
    expect(result.renderItems[5]).toMatchObject({ kind: 'card', uid: 'e', side: 'left', stackIndex: 2 });
    expect(result.renderItems[6]).toMatchObject({ kind: 'card', uid: 'f', side: 'active' });
    expect(result.overflowUids).toEqual(['b', 'c', 'd']);
  });

  it('renderItems_overflow_right_only: active + 5 right-collapsed → overflow-right between anchors', () => {
    // cards: [a, b, c, d, e, f], active=a → L=0, R=5
    const cards = ['a', 'b', 'c', 'd', 'e', 'f'].map(uid => ({ uid }));
    const state: StackState = { cards, activeUid: 'a' };
    const result = computeStackLayout(state);
    expect(result.numLeftCollapsed).toBe(0);
    expect(result.needsOverflow).toBe(true);
    // renderItems: [card-a, card-b, overflow-right, card-f]
    expect(result.renderItems).toHaveLength(4);
    expect(result.renderItems[0]).toMatchObject({ kind: 'card', uid: 'a', side: 'active' });
    expect(result.renderItems[1]).toMatchObject({ kind: 'card', uid: 'b', side: 'right' });
    expect(result.renderItems[2]).toMatchObject({ kind: 'overflow', side: 'right' });
    const overflowItem = result.renderItems[2] as Extract<RenderItem, { kind: 'overflow' }>;
    expect(overflowItem.hiddenUids).toEqual(['c', 'd', 'e']);
    expect(result.renderItems[3]).toMatchObject({ kind: 'card', uid: 'f', side: 'right' });
    expect(result.overflowUids).toEqual(['c', 'd', 'e']);
  });

  it('renderItems_overflow_both_sides: 3 left + active + 3 right → overflow on both sides', () => {
    // cards: [a, b, c, active, d, e, f], active=active
    const cards = ['a', 'b', 'c', 'act', 'd', 'e', 'f'].map(uid => ({ uid }));
    const state: StackState = { cards, activeUid: 'act' };
    const result = computeStackLayout(state);
    expect(result.numLeftCollapsed).toBe(3);
    expect(result.needsOverflow).toBe(true);
    // renderItems: [fc{a}, card-a, fc{overflow-left}, overflow-left, fc{c}, card-c, card-act, card-d, overflow-right, card-f]
    expect(result.renderItems).toHaveLength(10);
    expect(result.renderItems[0]).toMatchObject({ kind: 'fan-corner', forUid: 'a', i: 0, n: 3 });
    expect(result.renderItems[1]).toMatchObject({ kind: 'card', uid: 'a', side: 'left' });
    expect(result.renderItems[2]).toMatchObject({ kind: 'fan-corner', forUid: 'overflow-left', i: 1, n: 3 });
    expect(result.renderItems[3]).toMatchObject({ kind: 'overflow', side: 'left' });
    const leftOverflow = result.renderItems[3] as Extract<RenderItem, { kind: 'overflow' }>;
    expect(leftOverflow.hiddenUids).toEqual(['b']);
    expect(result.renderItems[4]).toMatchObject({ kind: 'fan-corner', forUid: 'c', i: 2, n: 3 });
    expect(result.renderItems[5]).toMatchObject({ kind: 'card', uid: 'c', side: 'left' });
    expect(result.renderItems[6]).toMatchObject({ kind: 'card', uid: 'act', side: 'active' });
    expect(result.renderItems[7]).toMatchObject({ kind: 'card', uid: 'd', side: 'right' });
    expect(result.renderItems[8]).toMatchObject({ kind: 'overflow', side: 'right' });
    const rightOverflow = result.renderItems[8] as Extract<RenderItem, { kind: 'overflow' }>;
    expect(rightOverflow.hiddenUids).toEqual(['e']);
    expect(result.renderItems[9]).toMatchObject({ kind: 'card', uid: 'f', side: 'right' });
  });

  it('fan_corner_i_n: i is sequential 0..n-1; n equals numLeftCollapsed', () => {
    // L=3 case: fan corners at i=0,1,2 with n=3
    const cards = ['a', 'b', 'c', 'd', 'e'].map(uid => ({ uid }));
    const state: StackState = { cards, activeUid: 'e' }; // L=4 → overflow, 3 left slots
    const result = computeStackLayout(state);
    const fanCorners = result.renderItems.filter(r => r.kind === 'fan-corner') as Extract<RenderItem, { kind: 'fan-corner' }>[];
    expect(fanCorners).toHaveLength(3);
    fanCorners.forEach((fc, idx) => {
      expect(fc.i).toBe(idx);
      expect(fc.n).toBe(result.numLeftCollapsed);
    });
  });

  it('overflow_threshold_updated: 10-card stack active-last → numLeftCollapsed 3, visible+overflow=10', () => {
    const cards = Array.from({ length: 10 }, (_, i) => ({ uid: `card-${i}` }));
    const state: StackState = { cards, activeUid: 'card-9' };
    const result = computeStackLayout(state);
    expect(result.needsOverflow).toBe(true);
    expect(result.numLeftCollapsed).toBe(3);
    expect(result.visible.length + result.overflowUids.length).toBe(10);
    // Left overflow hides cards 1..7 (7 cards)
    expect(result.overflowUids).toHaveLength(7);
  });

  it('no_overflow_at_two_left_one_right: L=2 R=1 → needsOverflow false, all cards in renderItems', () => {
    // cards: [a, b, active, c], active=active
    const state: StackState = {
      cards: [{ uid: 'a' }, { uid: 'b' }, { uid: 'act' }, { uid: 'c' }],
      activeUid: 'act',
    };
    const result = computeStackLayout(state);
    expect(result.needsOverflow).toBe(false);
    expect(result.overflowUids).toEqual([]);
    // renderItems: [fc{a}, card-a, fc{b}, card-b, card-act, card-c]
    expect(result.renderItems).toHaveLength(6);
    expect(result.renderItems.some(r => r.kind === 'overflow')).toBe(false);
    expect(result.numLeftCollapsed).toBe(2);
  });
});
