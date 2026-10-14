import { describe, it, expect, vi } from 'vitest';
import { createScenarioStore } from './store.ts';
import type { Scenario } from '../scenario/types';

const s0: Scenario = { walls: { width: 10, height: 6 }, player: { x: 0, y: 0, radius: 0.5 } };

describe('scenario store', () => {
  it('applies edits and notifies subscribers with the new scenario', () => {
    const store = createScenarioStore(s0);
    const seen = vi.fn();
    store.subscribe(seen);
    store.dispatch({ kind: 'set', path: ['walls', 'width'], value: 20 });
    expect(store.get().walls.width).toBe(20);
    expect(seen).toHaveBeenLastCalledWith(store.get());
  });
  it('replace swaps the whole scenario (loading another card)', () => {
    const store = createScenarioStore(s0);
    const other = { ...s0, walls: { width: 1, height: 1 } };
    store.replace(other);
    expect(store.get()).toBe(other);
  });
  it('unsubscribe stops notifications', () => {
    const store = createScenarioStore(s0);
    const seen = vi.fn();
    const off = store.subscribe(seen);
    off();
    store.dispatch({ kind: 'set', path: ['walls', 'width'], value: 2 });
    expect(seen).not.toHaveBeenCalled();
  });
});
