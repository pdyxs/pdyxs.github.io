import { writable } from 'svelte/store';
import type { StackState, LocationEntry } from '../lib/stack-layout';

export const stackStore = writable<StackState>(seedStackState(null));

/**
 * The state a freshly-rendered island seeds the store with (issue #102).
 *
 * `null` — the render has no active location, which is the home page — is an
 * *empty stack*, never "leave whatever is there alone". That distinction is
 * the whole bug: `stackStore` is module-level, and `astro build` prerenders
 * every page in one process, so a render that declines to write inherits the
 * previous page's stack. The store is per-visitor state on the client and
 * per-*process* state on the server, so the seed must be unconditional and
 * total — every render states its own initial stack, including the empty one.
 */
export function seedStackState(entry: LocationEntry | null): StackState {
  // A fresh object every call, never a shared constant: `entries` is an array
  // and the stack mutates through it, so one shared empty state would let one
  // render's push land in the next render's "empty".
  return entry ? { entries: [entry], activeSlot: entry.slot } : { entries: [], activeSlot: null };
}

export function pushToStack(state: StackState, entry: LocationEntry): StackState {
  return {
    entries: [...state.entries, entry],
    activeSlot: entry.slot,
  };
}

/** Removes the entry occupying `slot`, activating the one before it. */
export function removeFromStack(state: StackState, slot: string): StackState {
  const index = state.entries.findIndex(e => e.slot === slot);
  const newEntries = state.entries.filter(e => e.slot !== slot);
  let newActiveSlot = state.activeSlot;
  if (state.activeSlot === slot) {
    newActiveSlot = index > 0 ? state.entries[index - 1].slot : (newEntries[0]?.slot ?? null);
  }
  return { entries: newEntries, activeSlot: newActiveSlot };
}

/** Makes the entry occupying `slot` the active one. */
export function activateCard(state: StackState, slot: string): StackState {
  return { ...state, activeSlot: slot };
}

/**
 * Re-identifies the entry occupying `slot` (a lens whose filters were just
 * edited: its identity is the lens plus its filter set, so a filter change is
 * an identity change). The DOM/cache handle is deliberately untouched, so the
 * mounted fragment and its islands survive.
 *
 * `slot` rather than the old key, because the caller is the location itself
 * reporting from its own DOM node, and the handle is the one thing that never
 * moves under it.
 *
 * A re-key can land on an identity some OTHER entry already holds — clear the
 * filters on the second view of a lens and it becomes the unfiltered view
 * already sitting behind it. **Both entries stay** (issue #106): a stack is
 * the path you walked, a path that passes the same place twice is normal, and
 * an entry silently disappearing from the breadcrumb is worse than two that
 * look alike. Nothing here has to adjudicate the collision, because nothing
 * downstream resolves an entry by key any more — every address is a slot, and
 * slots are unique by construction.
 */
export function rekeyEntry(state: StackState, slot: string, newKey: string): StackState {
  const idx = state.entries.findIndex(e => e.slot === slot);
  if (idx === -1) return state;
  const old = state.entries[idx];
  if (old.key === newKey) return state;
  const entries = state.entries.map(e => (e.slot === slot ? { ...e, key: newKey } : e));
  return { entries, activeSlot: state.activeSlot };
}

/** Swaps the active entry for `newEntry`, which takes its position and becomes active. */
export function replaceActiveSlot(state: StackState, newEntry: LocationEntry): StackState {
  if (!state.activeSlot) return state;
  const idx = state.entries.findIndex(e => e.slot === state.activeSlot);
  if (idx === -1) return state;
  const newEntries = [...state.entries];
  newEntries[idx] = newEntry;
  return { entries: newEntries, activeSlot: newEntry.slot };
}
