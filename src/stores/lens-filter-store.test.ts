import { describe, it, expect } from 'vitest';
import { toggleFilterValue, toggleDimensionlessValue, clearFilterDimension, clearAllFilters, toggleStatusValue, clearStatusFilter } from './lens-filter-store';
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

describe('toggleDimensionlessValue', () => {
  it('adds a value to an empty dimensionless bucket', () => {
    const result = toggleDimensionlessValue(emptyState, 'science');
    expect(result.tags).toEqual(['science']);
  });

  it('appends a second dimensionless value', () => {
    const state: FilterState = { selections: {}, tags: ['science'] };
    const result = toggleDimensionlessValue(state, 'education');
    expect(result.tags).toEqual(['science', 'education']);
  });

  it('removes an already-selected dimensionless value (toggle off)', () => {
    const state: FilterState = { selections: {}, tags: ['science', 'education'] };
    const result = toggleDimensionlessValue(state, 'science');
    expect(result.tags).toEqual(['education']);
  });

  it('leaves the tags key empty when the last value is toggled off', () => {
    const state: FilterState = { selections: {}, tags: ['science'] };
    const result = toggleDimensionlessValue(state, 'science');
    expect(result.tags ?? []).toEqual([]);
  });

  it('does not mutate dimension selections', () => {
    const state: FilterState = { selections: { what: ['what:art'] } };
    const result = toggleDimensionlessValue(state, 'science');
    expect(result.selections.what).toEqual(['what:art']);
    expect(result.tags).toEqual(['science']);
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

describe('toggleStatusValue', () => {
  it('sets the status on a state with no active status', () => {
    const result = toggleStatusValue(emptyState, 'draft');
    expect(result.status).toBe('draft');
  });

  it('clears the status when the same value is toggled again (exclusive toggle)', () => {
    const state: FilterState = { selections: {}, status: 'draft' };
    const result = toggleStatusValue(state, 'draft');
    expect(result.status).toBeUndefined();
  });

  it('replaces the status when a different value is selected', () => {
    const state: FilterState = { selections: {}, status: 'draft' };
    const result = toggleStatusValue(state, 'archived');
    expect(result.status).toBe('archived');
  });

  it('does not mutate dimension selections or tags', () => {
    const state: FilterState = { selections: { what: ['what:puzzles'] }, tags: ['science'] };
    const result = toggleStatusValue(state, 'draft');
    expect(result.selections.what).toEqual(['what:puzzles']);
    expect(result.tags).toEqual(['science']);
  });
});

describe('clearStatusFilter', () => {
  it('removes an active status', () => {
    const state: FilterState = { selections: {}, status: 'draft' };
    const result = clearStatusFilter(state);
    expect(result.status).toBeUndefined();
  });

  it('is a no-op for a state with no active status', () => {
    const result = clearStatusFilter(emptyState);
    expect(result.status).toBeUndefined();
    expect(result.selections).toEqual({});
  });

  it('does not mutate dimension selections or tags', () => {
    const state: FilterState = { selections: { what: ['what:puzzles'] }, tags: ['science'], status: 'draft' };
    const result = clearStatusFilter(state);
    expect(result.selections.what).toEqual(['what:puzzles']);
    expect(result.tags).toEqual(['science']);
  });
});
