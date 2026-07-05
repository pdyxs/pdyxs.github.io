import { describe, it, expect } from 'vitest';
import { toggleFilterValue, clearFilterDimension, clearAllFilters } from './lens-filter-store';
import type { FilterState } from '../lib/filters';

const emptyState: FilterState = { selections: {} };

describe('toggleFilterValue', () => {
  it('adds a value to an empty dimension', () => {
    const result = toggleFilterValue(emptyState, 'what', 'what:puzzles');
    expect(result.selections.what).toEqual(['what:puzzles']);
  });

  it('appends a second value to an already-selected dimension', () => {
    const state: FilterState = { selections: { what: ['what:puzzles'] } };
    const result = toggleFilterValue(state, 'what', 'what:projects');
    expect(result.selections.what).toEqual(['what:puzzles', 'what:projects']);
  });

  it('removes an already-selected value (toggle off)', () => {
    const state: FilterState = { selections: { what: ['what:puzzles', 'what:projects'] } };
    const result = toggleFilterValue(state, 'what', 'what:puzzles');
    expect(result.selections.what).toEqual(['what:projects']);
  });

  it('deletes the dimension key entirely when the last value is toggled off', () => {
    const state: FilterState = { selections: { what: ['what:puzzles'] } };
    const result = toggleFilterValue(state, 'what', 'what:puzzles');
    expect(result.selections.what).toBeUndefined();
  });

  it('does not mutate other dimensions', () => {
    const state: FilterState = { selections: { who: ['who:pdyxs'] } };
    const result = toggleFilterValue(state, 'what', 'what:puzzles');
    expect(result.selections.who).toEqual(['who:pdyxs']);
  });
});

describe('clearFilterDimension', () => {
  it('removes only the given dimension', () => {
    const state: FilterState = { selections: { what: ['what:puzzles'], who: ['who:pdyxs'] } };
    const result = clearFilterDimension(state, 'what');
    expect(result.selections.what).toBeUndefined();
    expect(result.selections.who).toEqual(['who:pdyxs']);
  });

  it('is a no-op for a dimension with no selections', () => {
    const result = clearFilterDimension(emptyState, 'what');
    expect(result.selections).toEqual({});
  });
});

describe('clearAllFilters', () => {
  it('returns an empty selections object', () => {
    expect(clearAllFilters()).toEqual({ selections: {} });
  });
});
