import { describe, it, expect } from 'vitest';
import { computeStackLayout, cardEntry } from './stack-layout';
import type { StackState, RenderItem } from './stack-layout';

describe('computeStackLayout', () => {
  it('zero_cards: empty state returns empty result', () => {
    const state: StackState = { entries: [], activeKey: null };
    const result = computeStackLayout(state);
    expect(result.visible).toEqual([]);
    expect(result.overflowKeys).toEqual([]);
    expect(result.needsOverflow).toBe(false);
  });

  it('single_active_card: one card matching activeKey', () => {
    const state: StackState = { entries: [cardEntry('about/me')], activeKey: 'about/me' };
    const result = computeStackLayout(state);
    expect(result.visible).toHaveLength(1);
    expect(result.visible[0]).toMatchObject({
      key: 'about/me',
      stackIndex: 0,
      isActive: true,
      isCollapsed: false,
    });
    expect(result.overflowKeys).toEqual([]);
    expect(result.needsOverflow).toBe(false);
  });

  it('multiple_cards_active_in_middle: active has isActive, others isCollapsed', () => {
    const state: StackState = {
      entries: [cardEntry('a'), cardEntry('b'), cardEntry('c')],
      activeKey: 'b',
    };
    const result = computeStackLayout(state);
    expect(result.visible).toHaveLength(3);
    const a = result.visible.find(c => c.key === 'a')!;
    const b = result.visible.find(c => c.key === 'b')!;
    const c = result.visible.find(c => c.key === 'c')!;
    expect(a.isActive).toBe(false);
    expect(a.isCollapsed).toBe(true);
    expect(b.isActive).toBe(true);
    expect(b.isCollapsed).toBe(false);
    expect(c.isActive).toBe(false);
    expect(c.isCollapsed).toBe(true);
  });

  it('overflow_threshold: cards exceeding visible limit produce overflowKeys', () => {
    const entries = Array.from({ length: 10 }, (_, i) => cardEntry(`card-${i}`));
    const state: StackState = { entries, activeKey: 'card-9' };
    const result = computeStackLayout(state);
    expect(result.needsOverflow).toBe(true);
    expect(result.overflowKeys.length).toBeGreaterThan(0);
    expect(result.visible.length + result.overflowKeys.length).toBe(10);
  });

  // ── renderItems tests ──────────────────────────────────────────────────

  it('renderItems_no_overflow_active_last: 2 left-collapsed + active → fan-corner before each left slot', () => {
    const state: StackState = {
      entries: [cardEntry('a'), cardEntry('b'), cardEntry('c')],
      activeKey: 'c',
    };
    const result = computeStackLayout(state);
    expect(result.numLeftCollapsed).toBe(2);
    expect(result.renderItems).toHaveLength(5); // fc, card-a, fc, card-b, card-c
    expect(result.renderItems[0]).toMatchObject({ kind: 'fan-corner', forKey: 'a', i: 0, n: 2 });
    expect(result.renderItems[1]).toMatchObject({ kind: 'card', key: 'a', side: 'left', stackIndex: 0 });
    expect(result.renderItems[2]).toMatchObject({ kind: 'fan-corner', forKey: 'b', i: 1, n: 2 });
    expect(result.renderItems[3]).toMatchObject({ kind: 'card', key: 'b', side: 'left', stackIndex: 1 });
    expect(result.renderItems[4]).toMatchObject({ kind: 'card', key: 'c', side: 'active' });
  });

  it('renderItems_no_overflow_active_middle: 1 left + active + 1 right → fan-corner on left only', () => {
    const state: StackState = {
      entries: [cardEntry('a'), cardEntry('b'), cardEntry('c')],
      activeKey: 'b',
    };
    const result = computeStackLayout(state);
    expect(result.numLeftCollapsed).toBe(1);
    expect(result.renderItems).toHaveLength(4); // fc, card-a, card-b, card-c
    expect(result.renderItems[0]).toMatchObject({ kind: 'fan-corner', forKey: 'a', i: 0, n: 1 });
    expect(result.renderItems[1]).toMatchObject({ kind: 'card', key: 'a', side: 'left', stackIndex: 0 });
    expect(result.renderItems[2]).toMatchObject({ kind: 'card', key: 'b', side: 'active' });
    expect(result.renderItems[3]).toMatchObject({ kind: 'card', key: 'c', side: 'right' });
  });

  it('renderItems_overflow_left_only: 5 left-collapsed + active → overflow-left between anchors', () => {
    // entries: [a, b, c, d, e, f], active=f → L=5, R=0
    const entries = ['a', 'b', 'c', 'd', 'e', 'f'].map(cardEntry);
    const state: StackState = { entries, activeKey: 'f' };
    const result = computeStackLayout(state);
    expect(result.numLeftCollapsed).toBe(3);
    expect(result.needsOverflow).toBe(true);
    // renderItems: [fc{a}, card-a, fc{overflow-left}, overflow-left, fc{e}, card-e, card-f]
    expect(result.renderItems).toHaveLength(7);
    expect(result.renderItems[0]).toMatchObject({ kind: 'fan-corner', forKey: 'a', i: 0, n: 3 });
    expect(result.renderItems[1]).toMatchObject({ kind: 'card', key: 'a', side: 'left', stackIndex: 0 });
    expect(result.renderItems[2]).toMatchObject({ kind: 'fan-corner', forKey: 'overflow-left', i: 1, n: 3 });
    expect(result.renderItems[3]).toMatchObject({ kind: 'overflow', side: 'left', stackIndex: 1 });
    const overflowItem = result.renderItems[3] as Extract<RenderItem, { kind: 'overflow' }>;
    expect(overflowItem.hiddenKeys).toEqual(['b', 'c', 'd']);
    expect(result.renderItems[4]).toMatchObject({ kind: 'fan-corner', forKey: 'e', i: 2, n: 3 });
    expect(result.renderItems[5]).toMatchObject({ kind: 'card', key: 'e', side: 'left', stackIndex: 2 });
    expect(result.renderItems[6]).toMatchObject({ kind: 'card', key: 'f', side: 'active' });
    expect(result.overflowKeys).toEqual(['b', 'c', 'd']);
  });

  it('renderItems_overflow_right_only: active + 5 right-collapsed → overflow-right between anchors', () => {
    // entries: [a, b, c, d, e, f], active=a → L=0, R=5
    const entries = ['a', 'b', 'c', 'd', 'e', 'f'].map(cardEntry);
    const state: StackState = { entries, activeKey: 'a' };
    const result = computeStackLayout(state);
    expect(result.numLeftCollapsed).toBe(0);
    expect(result.needsOverflow).toBe(true);
    // renderItems: [card-a, card-b, overflow-right, card-f]
    expect(result.renderItems).toHaveLength(4);
    expect(result.renderItems[0]).toMatchObject({ kind: 'card', key: 'a', side: 'active' });
    expect(result.renderItems[1]).toMatchObject({ kind: 'card', key: 'b', side: 'right' });
    expect(result.renderItems[2]).toMatchObject({ kind: 'overflow', side: 'right' });
    const overflowItem = result.renderItems[2] as Extract<RenderItem, { kind: 'overflow' }>;
    expect(overflowItem.hiddenKeys).toEqual(['c', 'd', 'e']);
    expect(result.renderItems[3]).toMatchObject({ kind: 'card', key: 'f', side: 'right' });
    expect(result.overflowKeys).toEqual(['c', 'd', 'e']);
  });

  it('renderItems_overflow_both_sides: 3 left + active + 3 right → overflow on both sides', () => {
    // entries: [a, b, c, active, d, e, f], active=act
    const entries = ['a', 'b', 'c', 'act', 'd', 'e', 'f'].map(cardEntry);
    const state: StackState = { entries, activeKey: 'act' };
    const result = computeStackLayout(state);
    expect(result.numLeftCollapsed).toBe(3);
    expect(result.needsOverflow).toBe(true);
    // renderItems: [fc{a}, card-a, fc{overflow-left}, overflow-left, fc{c}, card-c, card-act, card-d, overflow-right, card-f]
    expect(result.renderItems).toHaveLength(10);
    expect(result.renderItems[0]).toMatchObject({ kind: 'fan-corner', forKey: 'a', i: 0, n: 3 });
    expect(result.renderItems[1]).toMatchObject({ kind: 'card', key: 'a', side: 'left' });
    expect(result.renderItems[2]).toMatchObject({ kind: 'fan-corner', forKey: 'overflow-left', i: 1, n: 3 });
    expect(result.renderItems[3]).toMatchObject({ kind: 'overflow', side: 'left' });
    const leftOverflow = result.renderItems[3] as Extract<RenderItem, { kind: 'overflow' }>;
    expect(leftOverflow.hiddenKeys).toEqual(['b']);
    expect(result.renderItems[4]).toMatchObject({ kind: 'fan-corner', forKey: 'c', i: 2, n: 3 });
    expect(result.renderItems[5]).toMatchObject({ kind: 'card', key: 'c', side: 'left' });
    expect(result.renderItems[6]).toMatchObject({ kind: 'card', key: 'act', side: 'active' });
    expect(result.renderItems[7]).toMatchObject({ kind: 'card', key: 'd', side: 'right' });
    expect(result.renderItems[8]).toMatchObject({ kind: 'overflow', side: 'right' });
    const rightOverflow = result.renderItems[8] as Extract<RenderItem, { kind: 'overflow' }>;
    expect(rightOverflow.hiddenKeys).toEqual(['e']);
    expect(result.renderItems[9]).toMatchObject({ kind: 'card', key: 'f', side: 'right' });
  });

  it('fan_corner_i_n: i is sequential 0..n-1; n equals numLeftCollapsed', () => {
    // L=3 case: fan corners at i=0,1,2 with n=3
    const entries = ['a', 'b', 'c', 'd', 'e'].map(cardEntry);
    const state: StackState = { entries, activeKey: 'e' }; // L=4 → overflow, 3 left slots
    const result = computeStackLayout(state);
    const fanCorners = result.renderItems.filter(r => r.kind === 'fan-corner') as Extract<RenderItem, { kind: 'fan-corner' }>[];
    expect(fanCorners).toHaveLength(3);
    fanCorners.forEach((fc, idx) => {
      expect(fc.i).toBe(idx);
      expect(fc.n).toBe(result.numLeftCollapsed);
    });
  });

  it('overflow_threshold_updated: 10-card stack active-last → numLeftCollapsed 3, visible+overflow=10', () => {
    const entries = Array.from({ length: 10 }, (_, i) => cardEntry(`card-${i}`));
    const state: StackState = { entries, activeKey: 'card-9' };
    const result = computeStackLayout(state);
    expect(result.needsOverflow).toBe(true);
    expect(result.numLeftCollapsed).toBe(3);
    expect(result.visible.length + result.overflowKeys.length).toBe(10);
    // Left overflow hides cards 1..7 (7 cards)
    expect(result.overflowKeys).toHaveLength(7);
  });

  it('no_overflow_at_two_left_one_right: L=2 R=1 → needsOverflow false, all cards in renderItems', () => {
    // entries: [a, b, active, c], active=act
    const state: StackState = {
      entries: [cardEntry('a'), cardEntry('b'), cardEntry('act'), cardEntry('c')],
      activeKey: 'act',
    };
    const result = computeStackLayout(state);
    expect(result.needsOverflow).toBe(false);
    expect(result.overflowKeys).toEqual([]);
    // renderItems: [fc{a}, card-a, fc{b}, card-b, card-act, card-c]
    expect(result.renderItems).toHaveLength(6);
    expect(result.renderItems.some(r => r.kind === 'overflow')).toBe(false);
    expect(result.numLeftCollapsed).toBe(2);
  });
});
