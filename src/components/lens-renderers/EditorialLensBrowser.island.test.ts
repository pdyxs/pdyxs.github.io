// The dev-only editorial dashboard against a fake pool (issue #150, slice 5 of
// docs/plans/shared-card-pool.md).
//
// It ships in no production build (lens-components.ts gates its loader on
// import.meta.env.DEV), so it moves no measured number — the reason it is cut
// over, and tested, is that a body left reading a prop slice 8 stops passing
// renders an EMPTY dashboard with no error anywhere. "Nothing in flight" is
// exactly what this lens says when it is working, which is what makes that
// failure silent.
//
// Island project: mounts a Svelte component, so no `.astro` import may reach
// this file.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import EditorialLensBrowser from '@components/lens-renderers/EditorialLensBrowser.svelte';
import { lensFilterStore } from '@stores/lens-filter-store';
import { emptyFilterState } from '@dimensions';
import { poolFailureMessage } from '@browse/results/browse-skeleton';
import {
  fakeCard,
  fakePool,
  pendingLoader,
  readyLoader,
  flakyLoader,
} from '../../test/fake-card-pool';

const POOL = fakePool([
  fakeCard('what/puzzles/fog', { status: 'draft' }),
  fakeCard('what/puzzles/mist', { status: 'scheduled' }),
  fakeCard('what/posts/hello', { status: 'published' }),
]);

let target: HTMLElement;
let app: Record<string, unknown> | null = null;

function render(props: Record<string, unknown>): HTMLElement {
  target = document.createElement('div');
  document.body.appendChild(target);
  // `as any`: the .astro client-directive prop shim widens the component type
  // past what mount() accepts.
  app = mount(EditorialLensBrowser as any, { target, props }) as Record<string, unknown>;
  return target;
}

beforeEach(() => {
  lensFilterStore.set(emptyFilterState());
});

afterEach(() => {
  if (app) unmount(app as any);
  target?.remove();
  app = null;
});

describe('EditorialLensBrowser pool states', () => {
  it('renders the skeleton, and never "nothing in flight", while the pool is in flight', () => {
    const el = render({ config: {}, loadPool: pendingLoader() });
    expect(el.querySelector('.fp-skeleton--pending')).not.toBeNull();
    expect(el.querySelector('.editorial-empty')).toBeNull();
    expect(el.querySelector('.editorial-groups')).toBeNull();
  });

  it('groups by declared status once the pool arrives', async () => {
    const el = render({ config: {}, loadPool: readyLoader(POOL) });
    await vi.waitFor(() => {
      expect(el.querySelector('.editorial-groups')).not.toBeNull();
    });
    const headings = [...el.querySelectorAll('.editorial-group-heading')].map(
      node => node.textContent?.trim(),
    );
    expect(headings).toEqual(['Drafts (1)', 'Scheduled (1)']);
    // The published card is not in flight and is not shown.
    expect(el.querySelectorAll('.browse-card-item')).toHaveLength(2);
    expect(el.querySelector('.fp-skeleton--pending')).toBeNull();
  });

  it('states a failure and retries into the dashboard', async () => {
    const { load, attempts } = flakyLoader(POOL, 1, 'network');
    const el = render({ config: {}, loadPool: load });

    await vi.waitFor(() => {
      expect(el.querySelector('.fp-pool-error')?.textContent?.trim()).toBe(
        poolFailureMessage('network'),
      );
    });
    expect(el.querySelector('.editorial-groups')).toBeNull();
    expect(attempts()).toBe(1);

    el.querySelector<HTMLButtonElement>('.fp-pool-retry')!.click();
    await vi.waitFor(() => {
      expect(el.querySelector('.editorial-groups')).not.toBeNull();
    });
    expect(attempts()).toBe(2);
  });
});
