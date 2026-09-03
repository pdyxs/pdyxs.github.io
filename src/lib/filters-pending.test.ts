import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  applyFiltersPending,
  clearFiltersPending,
  FILTERS_PENDING_ATTR,
  FILTERS_PENDING_STALL_MS,
  filtersPendingForTransition,
  hasFilterParamKey,
  isFilterParamKey,
  lensReRanksOnClient,
  stalledFiltersPending,
} from './filters-pending.ts';

describe('lensReRanksOnClient', () => {
  it('is true for a ranking lens — the two runtime rungs only exist in the browser', () => {
    expect(lensReRanksOnClient({ sortKey: 'ranking' })).toBe(true);
  });

  it('is true for either history lens — the pool is partitioned on localStorage', () => {
    expect(lensReRanksOnClient({ readState: 'seen' })).toBe(true);
    expect(lensReRanksOnClient({ readState: 'unseen' })).toBe(true);
  });

  it('is false for a date-sorted strip: its hydration order is the server’s', () => {
    expect(lensReRanksOnClient({ sortKey: 'date', sortDirection: 'desc', display: 'strip' })).toBe(false);
  });

  it('is false for no config at all', () => {
    expect(lensReRanksOnClient()).toBe(false);
    expect(lensReRanksOnClient({})).toBe(false);
  });
});

describe('filtersPendingForTransition', () => {
  const base = { isLens: true, hasFilterParams: false, hasReadHistory: false, lensConfig: null };

  it('never guards a card — a card fragment renders the same on both sides of the wire', () => {
    expect(filtersPendingForTransition({ ...base, isLens: false, hasFilterParams: true })).toBeNull();
  });

  it('carried filters are `filtered`: the fragment is fetched by uid, so the server rendered it unfiltered', () => {
    expect(
      filtersPendingForTransition({ ...base, hasFilterParams: true, lensConfig: { sortKey: 'ranking' } }),
    ).toBe('filtered');
  });

  it('filters win over the lens kind — even a date strip is the wrong CONTENT, not just the wrong order', () => {
    expect(
      filtersPendingForTransition({ ...base, hasFilterParams: true, lensConfig: { sortKey: 'date' } }),
    ).toBe('filtered');
  });

  it('a returning visitor’s re-ranking lens is the empty-string trigger', () => {
    expect(
      filtersPendingForTransition({ ...base, hasReadHistory: true, lensConfig: { sortKey: 'ranking' } }),
    ).toBe('');
  });

  it('a first-time visitor pays nothing: rung 3 cannot reorder an empty history', () => {
    expect(
      filtersPendingForTransition({ ...base, hasReadHistory: false, lensConfig: { sortKey: 'ranking' } }),
    ).toBeNull();
  });

  it('an unfiltered date strip lands immediately, however much the visitor has read', () => {
    expect(
      filtersPendingForTransition({ ...base, hasReadHistory: true, lensConfig: { sortKey: 'date' } }),
    ).toBeNull();
  });

  it('a history lens is guarded for a returning visitor', () => {
    expect(
      filtersPendingForTransition({ ...base, hasReadHistory: true, lensConfig: { readState: 'seen' } }),
    ).toBe('');
  });
});

describe('isFilterParamKey / hasFilterParamKey', () => {
  it('matches the pre-paint script’s test', () => {
    expect(isFilterParamKey('filter')).toBe(true);
    expect(isFilterParamKey('filter.what')).toBe(true);
    expect(isFilterParamKey('tab')).toBe(false);
    expect(isFilterParamKey('filtered')).toBe(false);
  });

  it('scans a key list', () => {
    expect(hasFilterParamKey(['tab', 'stack'])).toBe(false);
    expect(hasFilterParamKey(['tab', 'filter.where'])).toBe(true);
    expect(hasFilterParamKey([])).toBe(false);
  });
});

describe('stalledFiltersPending', () => {
  it('a filtered guard re-flags rather than revealing the wrong content', () => {
    expect(stalledFiltersPending('filtered')).toBe('stalled');
  });

  it('a stalled guard stays stalled', () => {
    expect(stalledFiltersPending('stalled')).toBe('stalled');
  });

  it('a re-rank-only guard reveals: correct content in a stale order', () => {
    expect(stalledFiltersPending('')).toBeNull();
  });

  it('an already-cleared guard has nothing to do', () => {
    expect(stalledFiltersPending(null)).toBeNull();
  });
});

describe('applyFiltersPending / clearFiltersPending', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.removeAttribute(FILTERS_PENDING_ATTR);
    document.body.innerHTML = '';
  });

  function stack() {
    document.body.innerHTML = `
      <div id="card-stack">
        <div class="stack-card" id="a"><main class="fp-browse-grid" id="a-host"></main></div>
        <div class="stack-card" id="b"><main class="fp-browse-grid" id="b-host"></main></div>
      </div>`;
    return {
      a: document.getElementById('a')!,
      b: document.getElementById('b')!,
      aHost: document.getElementById('a-host')!,
      bHost: document.getElementById('b-host')!,
    };
  }

  it('flags the host it is given, and nothing else', () => {
    const { a, b } = stack();
    applyFiltersPending(a, 'filtered');
    expect(a.getAttribute(FILTERS_PENDING_ATTR)).toBe('filtered');
    expect(b.hasAttribute(FILTERS_PENDING_ATTR)).toBe(false);
    expect(document.documentElement.hasAttribute(FILTERS_PENDING_ATTR)).toBe(false);
  });

  it('clears the nearest host above the island — the card on a transition', () => {
    const { a, aHost } = stack();
    applyFiltersPending(a, 'filtered');
    clearFiltersPending(aHost);
    expect(a.hasAttribute(FILTERS_PENDING_ATTR)).toBe(false);
  });

  it('clears <html> on a cold load, where that is the nearest host', () => {
    const { aHost } = stack();
    document.documentElement.setAttribute(FILTERS_PENDING_ATTR, 'filtered');
    clearFiltersPending(aHost);
    expect(document.documentElement.hasAttribute(FILTERS_PENDING_ATTR)).toBe(false);
  });

  it('an island in ANOTHER card clears nothing — the premature reveal this scoping exists to stop', () => {
    const { a, bHost } = stack();
    applyFiltersPending(a, 'filtered');
    clearFiltersPending(bHost);
    expect(a.getAttribute(FILTERS_PENDING_ATTR)).toBe('filtered');
  });

  it('a null node is a no-op', () => {
    expect(() => clearFiltersPending(null)).not.toThrow();
  });

  it('the safety net re-flags a filtered guard rather than revealing it', () => {
    const { a } = stack();
    applyFiltersPending(a, 'filtered');
    vi.advanceTimersByTime(FILTERS_PENDING_STALL_MS);
    expect(a.getAttribute(FILTERS_PENDING_ATTR)).toBe('stalled');
  });

  it('the safety net reveals a re-rank-only guard', () => {
    const { a } = stack();
    applyFiltersPending(a, '');
    vi.advanceTimersByTime(FILTERS_PENDING_STALL_MS);
    expect(a.hasAttribute(FILTERS_PENDING_ATTR)).toBe(false);
  });

  it('the net cannot resurrect a guard the island already cleared', () => {
    const { a, aHost } = stack();
    applyFiltersPending(a, 'filtered');
    clearFiltersPending(aHost);
    vi.advanceTimersByTime(FILTERS_PENDING_STALL_MS);
    expect(a.hasAttribute(FILTERS_PENDING_ATTR)).toBe(false);
  });

  it('the net leaves a card that has since been closed alone', () => {
    const { a } = stack();
    applyFiltersPending(a, 'filtered');
    a.remove();
    vi.advanceTimersByTime(FILTERS_PENDING_STALL_MS);
    expect(a.getAttribute(FILTERS_PENDING_ATTR)).toBe('filtered');
  });
});
