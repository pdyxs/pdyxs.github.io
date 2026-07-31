import { describe, it, expect } from 'vitest';
import { paramsAfterSlotReplace } from './slot-params';
import { serialiseStack } from './stack-codec';
import type { ParamPairs } from './stack-codec';
import { lensEntry } from './stack-layout';
import type { StackState } from './stack-layout';
import { buildLookup } from './stack-manifest';
import { filterStateFromParams, filterStateToParams, toggleValue } from '../dimensions';
import type { FiveWDimension } from './five-w';
import type { FilterState } from '../dimensions';

const FILTER: ParamPairs = [['filter.what', 'what:art']];

describe('paramsAfterSlotReplace', () => {
  it('drops the outgoing location params when it leaves the stack', () => {
    const next = paramsAfterSlotReplace(
      new Map([['lens/newest', FILTER]]),
      'lens/newest',
      'lens/home',
      [],
    );
    expect(next.has('lens/newest')).toBe(false);
  });

  it('sets the carried params as the incoming location params, not merged onto what it held', () => {
    const next = paramsAfterSlotReplace(
      new Map([['lens/oldest', [['filter.what', 'what:games']] as ParamPairs]]),
      'lens/newest',
      'lens/oldest',
      FILTER,
    );
    expect(next.get('lens/oldest')).toEqual(FILTER);
  });

  it('clears stale params on an incoming location when nothing is carried', () => {
    const next = paramsAfterSlotReplace(new Map([['lens/oldest', FILTER]]), 'lens/newest', 'lens/oldest', []);
    expect(next.has('lens/oldest')).toBe(false);
  });

  it('keeps existing params when the active slot is re-selected with nothing carried', () => {
    // Re-selecting the active lens doesn't remount its shell, so nothing would
    // report the live selection back — dropping it here would lose it silently.
    const next = paramsAfterSlotReplace(new Map([['lens/newest', FILTER]]), 'lens/newest', 'lens/newest', []);
    expect(next.get('lens/newest')).toEqual(FILTER);
  });

  it('leaves other locations in the stack untouched', () => {
    const next = paramsAfterSlotReplace(
      new Map([['lens/newest', FILTER], ['what/art/lino-printing', [['x', '1']] as ParamPairs]]),
      'lens/newest',
      'lens/oldest',
      FILTER,
    );
    expect(next.get('what/art/lino-printing')).toEqual([['x', '1']]);
  });

  it('preserves multi-value selections in order', () => {
    const multi: ParamPairs = [['filter.what', 'what:art'], ['filter.what', 'what:games']];
    const next = paramsAfterSlotReplace(new Map(), 'lens/newest', 'lens/oldest', multi);
    expect(next.get('lens/oldest')).toEqual(multi);
  });
});

// Journey-level regression cover for the two reported lens-swap filter bugs.
// These compose the real collaborators the browser wires together — the params
// decision, serialiseStack (which writes the address bar), and
// filterStateFromParams (which LensFilterShell reads back on mount, and which
// feeds the active-filter chips) — so a regression shows up as the symptom the
// user sees: a filter that returns from the dead, or one counted twice.
describe('lens swaps with an active filter', () => {
  const manifest = buildLookup([
    { uid: 'lens/home', code: '0' },
    { uid: 'lens/newest', code: '1' },
    { uid: 'lens/oldest', code: '2' },
  ]);
  const tags = buildLookup([{ uid: 'what:art', code: '0' }]);

  /** The slice of CardStack + LensFilterShell these bugs live in. */
  class Session {
    params = new Map<string, ParamPairs>();
    state: StackState;
    /** What the address bar holds — the shell's only input on mount. */
    search = '';

    constructor(lens: string) {
      this.state = { entries: [lensEntry(lens)], activeKey: `lens/${lens}` };
    }

    /** CardStack.updateUrl */
    private serialise() {
      this.search = serialiseStack(this.state, this.params, manifest, tags).search;
    }

    /** What LensFilterShell.syncFromUrl seeds the store (and the chips) with. */
    get filterState(): FilterState {
      return filterStateFromParams(new URLSearchParams(this.search));
    }

    /** LensFilterShell.handleFilterToggle → reportFiltersToStack → onCardParam */
    toggleFilter(dim: FiveWDimension, value: string) {
      const next = toggleValue(this.filterState, dim, value);
      const pairs: ParamPairs = [];
      filterStateToParams(next).forEach((v, k) => { pairs.push([k, v]); });
      const key = this.state.activeKey!;
      if (pairs.length) this.params.set(key, pairs); else this.params.delete(key);
      this.serialise();
    }

    /** A DimensionPanel lens click: CardStack.replaceSlot, then the incoming
     * shell mounting. `acceptsFilters` drives both halves — the panel only
     * carries the selection to a lens that can hold it, and a lens that can't
     * strips any filter params that reached its URL anyway. */
    swapTo(lens: string, acceptsFilters: boolean) {
      const carried: ParamPairs = [];
      if (acceptsFilters) filterStateToParams(this.filterState).forEach((v, k) => { carried.push([k, v]); });

      const uid = `lens/${lens}`;
      this.params = paramsAfterSlotReplace(this.params, this.state.activeKey, uid, carried);
      this.state = { entries: [lensEntry(lens)], activeKey: uid };
      this.serialise();

      if (!acceptsFilters) this.search = '';
    }
  }

  it('does not resurrect a cleared filter after a round trip through a filterless lens', () => {
    const s = new Session('newest');
    s.toggleFilter('what', 'what:art');
    expect(s.search).toBe('?filter.what=art');

    // "A bit of everything" (acceptsFilters: false) — the selection is dropped.
    s.swapTo('home', false);
    expect(s.filterState.what).toBeUndefined();

    // Back to newest: the filter must stay gone, not return from a stale entry.
    s.swapTo('newest', true);
    expect(s.search).toBe('');
    expect(s.filterState.what).toBeUndefined();
  });

  it('carries a filter across repeated swaps without ever duplicating it', () => {
    const s = new Session('newest');
    s.toggleFilter('what', 'what:art');

    for (const lens of ['oldest', 'newest', 'oldest', 'newest']) {
      s.swapTo(lens, true);
      // One param, one chip — never `?filter.what=art&filter.what=art`.
      expect(new URLSearchParams(s.search).getAll('filter.what')).toEqual(['art']);
      expect(s.filterState.what).toEqual(['what:art']);
    }
  });

  it('still clears a filter toggled off after a swap', () => {
    const s = new Session('newest');
    s.toggleFilter('what', 'what:art');
    s.swapTo('oldest', true);
    s.toggleFilter('what', 'what:art');
    expect(s.search).toBe('');
    expect(s.filterState.what).toBeUndefined();
  });
});
