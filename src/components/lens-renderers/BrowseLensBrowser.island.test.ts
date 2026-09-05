// The browse-family body against a fake pool (issue #150, slice 5 of
// docs/plans/shared-card-pool.md).
//
// Runs in the **island** vitest project, because it mounts a Svelte component.
// No `.astro` import may reach this file — there is no Astro plugin here to
// transform one, which is also why the pool is injected as a `loadPool` prop
// rather than reached through the endpoint.
//
// What the three cases are for: the body no longer takes its cards as a prop,
// so `null` (still loading), an arrival, and a failure are the whole of its
// state machine, and only the first two ever existed before. The failure case
// asserts the retry contract end to end — the loader drops a failed attempt, so
// clicking `.fp-pool-retry` has to produce a *second* fetch and then a grid.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import BrowseLensBrowser from './BrowseLensBrowser.svelte';
import { lensFilterStore, lensFiltersSynced } from '../../stores/lens-filter-store';
import { emptyFilterState } from '../../dimensions';
import { poolFailureMessage } from '../../lib/browse-skeleton';
import {
  fakeCard,
  fakePool,
  pendingLoader,
  readyLoader,
  flakyLoader,
} from '../../test/fake-card-pool';

const POOL = fakePool([fakeCard('what/puzzles/fog'), fakeCard('what/puzzles/mist')]);

let target: HTMLElement;
let app: Record<string, unknown> | null = null;

function render(props: Record<string, unknown>): HTMLElement {
  // `as any`: the .astro client-directive prop shim widens the component type
  // past what mount() accepts — same cast as CardStack.island.test.ts.
  app = mount(BrowseLensBrowser as any, { target, props }) as Record<string, unknown>;
  return target;
}

beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
  lensFilterStore.set(emptyFilterState());
  lensFiltersSynced.set(false);
  localStorage.clear();
});

afterEach(() => {
  if (app) unmount(app as any);
  target.remove();
  app = null;
});

describe('BrowseLensBrowser pool states', () => {
  it('renders the skeleton, and no results, while the pool is in flight', () => {
    const el = render({ config: {}, loadPool: pendingLoader() });
    const skeleton = el.querySelector('.fp-skeleton')!;
    expect(skeleton).not.toBeNull();
    // It draws ITSELF: nothing sets data-filters-pending on an unfiltered cold
    // load, and the base .fp-skeleton rule is `display: none`.
    expect(skeleton.classList.contains('fp-skeleton--pending')).toBe(true);
    expect(el.querySelector('.fp-browse-list')).toBeNull();
    // `null` is not `[]` — the empty state must not claim a filter matched
    // nothing while the request is still open.
    expect(el.querySelector('.fp-browse-empty')).toBeNull();
    expect(el.querySelector('.fp-result-count')).toBeNull();
  });

  it('renders the grid once the pool arrives', async () => {
    const el = render({ config: {}, loadPool: readyLoader(POOL) });
    await vi.waitFor(() => {
      expect(el.querySelector('.fp-browse-list')).not.toBeNull();
    });
    expect(el.querySelectorAll('.browse-card-item')).toHaveLength(2);
    expect(el.querySelector('.fp-skeleton--pending')).toBeNull();
    expect(el.querySelector('.fp-result-count')?.textContent?.trim()).toBe('2 cards');
  });

  it('lays a strip lens out as a strip once the pool arrives', async () => {
    const el = render({
      config: { display: 'strip', limit: 30 },
      loadPool: readyLoader(POOL),
    });
    // The layout is decided from the config alone, so the SKELETON already
    // knows which shape it is standing in for — before any card exists.
    expect(el.querySelector('.fp-skeleton--strip')).not.toBeNull();
    await vi.waitFor(() => {
      expect(el.querySelector('.card-strip')).not.toBeNull();
    });
  });

  it('states a failure and retries into a grid', async () => {
    const { load, attempts } = flakyLoader(POOL, 1, 'timeout');
    const el = render({ config: {}, loadPool: load });

    await vi.waitFor(() => {
      expect(el.querySelector('.fp-pool-error')).not.toBeNull();
    });
    expect(el.querySelector('.fp-pool-error')?.textContent?.trim()).toBe(
      poolFailureMessage('timeout'),
    );
    // The failed box turns itself on; the pending one is gone.
    expect(el.querySelector('.fp-skeleton')!.classList.contains('fp-skeleton--failed'))
      .toBe(true);
    expect(el.querySelector('.fp-browse-list')).toBeNull();
    expect(attempts()).toBe(1);

    el.querySelector<HTMLButtonElement>('.fp-pool-retry')!.click();

    await vi.waitFor(() => {
      expect(el.querySelector('.fp-browse-list')).not.toBeNull();
    });
    expect(attempts()).toBe(2);
    expect(el.querySelector('.fp-pool-error')).toBeNull();
  });

  it('clears the anti-FOUC guard only once the pool has landed', async () => {
    const host = document.createElement('div');
    host.className = 'stack-card';
    host.setAttribute('data-filters-pending', 'filtered');
    document.body.appendChild(host);
    host.appendChild(target);
    lensFiltersSynced.set(true);

    const { load, attempts } = flakyLoader(POOL, 1);
    render({ config: {}, loadPool: load });

    await vi.waitFor(() => expect(attempts()).toBe(1));
    // A failure is not an arrival: nothing may be revealed.
    expect(host.getAttribute('data-filters-pending')).toBe('filtered');

    target.querySelector<HTMLButtonElement>('.fp-pool-retry')!.click();
    await vi.waitFor(() => {
      expect(host.getAttribute('data-filters-pending')).toBeNull();
    });
    host.remove();
  });
});
