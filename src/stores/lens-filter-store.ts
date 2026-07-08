import { writable } from 'svelte/store';
import type { FilterState, Dimension } from '../lib/filters';

/**
 * Single source of truth for the active lens's filter selections. Astro's
 * client:* islands can't share live reactive props across independent
 * hydration boundaries, so LensFilterShell.svelte (the sole writer, synced
 * from the URL) and each lens body (a reader, deriving its own filtered view
 * via applyFilters) coordinate only through this store — same cross-island
 * pattern card-stack-store.ts already uses for stackStore.
 */
export const lensFilterStore = writable<FilterState>({ selections: {} });

export function toggleFilterValue(state: FilterState, dim: Dimension, value: string): FilterState {
  const existing = state.selections[dim] ?? [];
  const updated = existing.includes(value)
    ? existing.filter(v => v !== value)
    : [...existing, value];
  const newSelections = { ...state.selections };
  if (updated.length === 0) {
    delete newSelections[dim];
  } else {
    newSelections[dim] = updated;
  }
  return { ...state, selections: newSelections };
}

/** Toggles a dimensionless filter value in the `tags` bucket (see filters.ts). */
export function toggleDimensionlessValue(state: FilterState, value: string): FilterState {
  const existing = state.tags ?? [];
  const updated = existing.includes(value)
    ? existing.filter(v => v !== value)
    : [...existing, value];
  if (updated.length === 0) {
    const { tags: _drop, ...rest } = state;
    return rest;
  }
  return { ...state, tags: updated };
}

export function clearFilterDimension(state: FilterState, dim: Dimension): FilterState {
  const newSelections = { ...state.selections };
  delete newSelections[dim];
  return { ...state, selections: newSelections };
}

export function clearAllFilters(): FilterState {
  return { selections: {} };
}
