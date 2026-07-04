import { writable } from 'svelte/store';
import type { StackState, LocationEntry } from '../lib/stack-layout';

export const stackStore = writable<StackState>({ entries: [], activeKey: null });

export function pushToStack(state: StackState, entry: LocationEntry): StackState {
  return {
    entries: [...state.entries, entry],
    activeKey: entry.key,
  };
}

export function removeFromStack(state: StackState, key: string): StackState {
  const index = state.entries.findIndex(e => e.key === key);
  const newEntries = state.entries.filter(e => e.key !== key);
  let newActiveKey = state.activeKey;
  if (state.activeKey === key) {
    newActiveKey = index > 0 ? state.entries[index - 1].key : (newEntries[0]?.key ?? null);
  }
  return { entries: newEntries, activeKey: newActiveKey };
}

export function activateCard(state: StackState, key: string): StackState {
  return { ...state, activeKey: key };
}

export function replaceActiveSlot(state: StackState, newEntry: LocationEntry): StackState {
  if (!state.activeKey) return state;
  const idx = state.entries.findIndex(e => e.key === state.activeKey);
  if (idx === -1) return state;
  const newEntries = [...state.entries];
  newEntries[idx] = newEntry;
  return { entries: newEntries, activeKey: newEntry.key };
}
