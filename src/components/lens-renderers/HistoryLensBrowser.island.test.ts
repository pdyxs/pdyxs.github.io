// The two history lenses against a fake pool (issue #150, slice 5 of
// docs/plans/shared-card-pool.md).
//
// Island project: this mounts a Svelte component, so no `.astro` import may
// reach it. The pool is injected as `loadPool`.
//
// The load-bearing test is the last one. Seen and Unseen must PARTITION the
// pool exactly — every card in one of them, none in both — and both key on
// `uid` ALONE (hasBeenRead), never uid + contentHash, so a card that was read
// and then edited stays in Seen and out of Unseen. Taking the cards from the
// shared pool rather than a prop moves *when* the read snapshot is taken (it
// now settles with the pool), which is exactly the kind of change that could
// break that quietly.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import HistoryLensBrowser from './HistoryLensBrowser.svelte';
import { lensFilterStore } from '../../stores/lens-filter-store';
import { emptyFilterState } from '../../dimensions';
import { markRead } from '../../lib/card-view-state';
import { poolFailureMessage } from '../../lib/browse-skeleton';
import {
  fakeCard,
  fakePool,
  pendingLoader,
  readyLoader,
  flakyLoader,
} from '../../test/fake-card-pool';

const CARDS = [
  fakeCard('what/puzzles/fog'),
  fakeCard('what/puzzles/mist'),
  fakeCard('what/posts/hello'),
];
const POOL = fakePool(CARDS);

let mounted: Array<{ app: Record<string, unknown>; target: HTMLElement }> = [];

function render(props: Record<string, unknown>): HTMLElement {
  const target = document.createElement('div');
  document.body.appendChild(target);
  // `as any`: the .astro client-directive prop shim widens the component type
  // past what mount() accepts.
  const app = mount(HistoryLensBrowser as any, { target, props }) as Record<string, unknown>;
  mounted.push({ app, target });
  return target;
}

function renderedUids(el: HTMLElement): string[] {
  return [...el.querySelectorAll('.browse-card-item')].map(
    node => node.querySelector('a')?.getAttribute('href') ?? '',
  );
}

beforeEach(() => {
  lensFilterStore.set(emptyFilterState());
  localStorage.clear();
});

afterEach(() => {
  for (const { app, target } of mounted) {
    unmount(app as any);
    target.remove();
  }
  mounted = [];
});

describe('HistoryLensBrowser pool states', () => {
  it('renders the skeleton, and no empty message, while the pool is in flight', () => {
    const el = render({ config: { readState: 'seen' }, loadPool: pendingLoader() });
    expect(el.querySelector('.fp-skeleton--pending')).not.toBeNull();
    // `null` is not `[]`: "you haven't opened anything yet" over a request
    // still in flight is the one lie this lens must not tell.
    expect(el.querySelector('.fp-browse-empty')).toBeNull();
    expect(el.querySelector('.fp-browse-list')).toBeNull();
  });

  it('renders the results once the pool arrives', async () => {
    markRead('what/puzzles/fog', 'hash-what/puzzles/fog');
    const el = render({ config: { readState: 'seen' }, loadPool: readyLoader(POOL) });
    await vi.waitFor(() => {
      expect(el.querySelector('.fp-browse-list')).not.toBeNull();
    });
    expect(el.querySelectorAll('.browse-card-item')).toHaveLength(1);
  });

  it('says the honest empty thing once the pool has landed and the history is empty', async () => {
    const el = render({ config: { readState: 'seen' }, loadPool: readyLoader(POOL) });
    await vi.waitFor(() => {
      expect(el.querySelector('.fp-browse-empty')).not.toBeNull();
    });
    // The reason, from the UNFILTERED pool — not the filter wording.
    expect(el.querySelector('.fp-browse-empty')?.textContent).toContain('Nothing here yet');
  });

  it('states a failure and retries into results', async () => {
    const { load, attempts } = flakyLoader(POOL, 1, 'malformed');
    const el = render({ config: { readState: 'unseen' }, loadPool: load });

    await vi.waitFor(() => {
      expect(el.querySelector('.fp-pool-error')?.textContent?.trim()).toBe(
        poolFailureMessage('malformed'),
      );
    });
    expect(attempts()).toBe(1);

    el.querySelector<HTMLButtonElement>('.fp-pool-retry')!.click();
    await vi.waitFor(() => {
      expect(el.querySelector('.fp-browse-list')).not.toBeNull();
    });
    expect(attempts()).toBe(2);
    expect(el.querySelectorAll('.browse-card-item')).toHaveLength(CARDS.length);
  });
});

describe('Seen and Unseen partition the pool', () => {
  it('puts every card in exactly one of the two', async () => {
    markRead('what/puzzles/fog', 'hash-what/puzzles/fog');
    // Read, then EDITED: the hash no longer matches what was read. It stays in
    // Seen and out of Unseen, because membership keys on uid alone — freshness
    // is a ranking signal, membership is a fact about the visitor.
    markRead('what/posts/hello', 'stale-hash');

    const seen = render({ config: { readState: 'seen' }, loadPool: readyLoader(POOL) });
    const unseen = render({ config: { readState: 'unseen' }, loadPool: readyLoader(POOL) });

    await vi.waitFor(() => {
      expect(seen.querySelector('.fp-browse-list')).not.toBeNull();
      expect(unseen.querySelector('.fp-browse-list')).not.toBeNull();
    });

    const seenUids = renderedUids(seen);
    const unseenUids = renderedUids(unseen);
    expect(seenUids.sort()).toEqual(['/card/what/posts/hello', '/card/what/puzzles/fog']);
    expect(unseenUids).toEqual(['/card/what/puzzles/mist']);
    // No overlap, and nothing missing.
    expect(seenUids.filter(uid => unseenUids.includes(uid))).toEqual([]);
    expect(seenUids.length + unseenUids.length).toBe(CARDS.length);
  });
});
