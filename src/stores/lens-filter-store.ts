import { writable } from 'svelte/store';
import type { FilterState, Dimension } from '../lib/filters';
import type { StatusValue } from '../lib/status-visibility';

/**
 * Single source of truth for the active lens's filter selections. Astro's
 * client:* islands can't share live reactive props across independent
 * hydration boundaries, so LensFilterShell.svelte (the sole writer, synced
 * from the URL) and each lens body (a reader, deriving its own filtered view
 * via applyFilters) coordinate only through this store — same cross-island
 * pattern card-stack-store.ts already uses for stackStore.
 */
export const lensFilterStore = writable<FilterState>({ selections: {} });

/**
 * Flips to true once LensFilterShell has synced the filter selection from the
 * URL on mount. The pre-paint anti-FOUC guard (`data-filters-pending`, set by
 * the inline script in Base.astro) hides browse results until a lens body sees
 * this go true and clears the guard — so a filtered cold load never flashes the
 * full unfiltered set before reducing to the selection.
 */
export const lensFiltersSynced = writable(false);

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

/**
 * Toggles the dev-only status facet (issue #52). Exclusive, not multi-select
 * like a dimension bucket — a card has exactly one status, so re-selecting
 * the active value clears it and selecting a different value replaces it.
 */
export function toggleStatusValue(state: FilterState, value: StatusValue): FilterState {
  if (state.status === value) {
    const { status: _drop, ...rest } = state;
    return rest;
  }
  return { ...state, status: value };
}

/** Removes the active status facet selection (e.g. an active-filter chip's ×). */
export function clearStatusFilter(state: FilterState): FilterState {
  const { status: _drop, ...rest } = state;
  return rest;
}
