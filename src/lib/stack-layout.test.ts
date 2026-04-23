import { describe, it, expect } from 'vitest';
import { computeStackLayout } from './stack-layout';
import type { StackState } from './stack-layout';

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
});
