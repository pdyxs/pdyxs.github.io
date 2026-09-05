// The home lens body against a fake pool (issue #151, slice 6 of
// docs/plans/shared-card-pool.md).
//
// Runs in the **island** vitest project, because it mounts a Svelte component.
// No `.astro` import may reach this file — there is no Astro plugin here to
// transform one, which is also why the pool is injected as a `loadPool` prop
// rather than reached through the endpoint.
//
// What this asserts that the browse-family tests don't: home has NO skeleton
// and no removal moment. The grid — spans, rows, labels, "See more →" — is
// there in every one of the three states, and only the cell interiors change.
// That is #133's shipped pattern, and #140 says slice 6 must not add a state
// to it; a test that only looked for a loading indicator would pass while the
// grid had been replaced by one.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount } from 'svelte';
import { vi } from 'vitest';
import HomeLensSlots from './HomeLensSlots.svelte';
import { lensFilterStore } from '../../stores/lens-filter-store';
import { emptyFilterState } from '../../dimensions';
import { poolFailureMessage } from '../../lib/browse-skeleton';
import { BROWSE_CARD_VARIANTS } from '../../lib/browse-card-variants';
import {
  fakeCard,
  fakePool,
  pendingLoader,
  readyLoader,
  flakyLoader,
} from '../../test/fake-card-pool';
import type { FrontPageConfig } from '../../lib/frontpage';

const CONFIG: FrontPageConfig = {
  slots: [
    {
      uid: 'what/puzzles/fog',
      span: { small: 7, large: 8 },
      rows: { small: 1, large: 1 },
      side: 'main',
      variant: 'brief',
      seeMore: false,
    },
    {
      filter: { what: ['what:puzzles'] },
      span: { small: 5, large: 4 },
      rows: { small: 2, large: 2 },
      side: 'right',
      variant: 'full',
      label: 'A Puzzle',
      seeMore: true,
    },
  ],
};

const POOL = fakePool([fakeCard('what/puzzles/fog'), fakeCard('what/puzzles/mist')]);

let target: HTMLElement;
let app: Record<string, unknown> | null = null;

function render(props: Record<string, unknown>): HTMLElement {
  // `as any`: the .astro client-directive prop shim widens the component type
  // past what mount() accepts — same cast as CardStack.island.test.ts.
  app = mount(HomeLensSlots as any, { target, props }) as Record<string, unknown>;
  return target;
}

/** The chrome that must be identical in every state. */
function expectGridChrome(el: HTMLElement) {
  expect(el.querySelector('.fp-slot-grid')).not.toBeNull();
  expect(el.querySelectorAll('.fp-slot')).toHaveLength(2);
  expect(el.querySelector('.fp-slot--rail')).not.toBeNull();
  expect(el.querySelector('.fp-slot-label')?.textContent?.trim()).toBe('A Puzzle');
  expect(el.querySelector('.fp-see-more')).not.toBeNull();
}

beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
  lensFilterStore.set(emptyFilterState());
  localStorage.clear();
});

afterEach(() => {
  if (app) unmount(app as any);
  target.remove();
  app = null;
});

describe('HomeLensSlots pool states', () => {
  it('draws the whole grid, with placeholder interiors, while the pool is in flight', () => {
    const el = render({ config: CONFIG, loadPool: pendingLoader() });

    expectGridChrome(el);
    expect(el.querySelectorAll('.fp-slot-placeholder')).toHaveLength(2);
    // `null` is not `[]`: no card may be rendered, and no "nothing here"
    // message may claim the page has finished.
    expect(el.querySelector('.browse-card-item')).toBeNull();
    expect(el.querySelector('.fp-slot-stalled')).toBeNull();
    expect(el.querySelector('.fp-pool-retry')).toBeNull();

    // The floor is what makes the swap cost no document height: the
    // placeholder interior carries the same measured minimum the real card's
    // own content box does.
    const interior = el.querySelector<HTMLElement>('.fp-slot-placeholder-content')!;
    expect(interior.parentElement!.style.getPropertyValue('--browse-card-min-height')).toBe(
      BROWSE_CARD_VARIANTS.brief.minHeight,
    );
  });

  it('fills the interiors when the pool arrives, and moves nothing else', async () => {
    const el = render({ config: CONFIG, loadPool: readyLoader(POOL) });

    await vi.waitFor(() => {
      expect(el.querySelectorAll('.browse-card-item')).toHaveLength(2);
    });
    expectGridChrome(el);
    expect(el.querySelector('.fp-slot-placeholder')).toBeNull();
    // The chips read the pool's labels, not humanised slugs.
    expect(el.textContent).toContain('Puzzles');
  });

  it('states a failure honestly and retries into the real cards', async () => {
    const { load, attempts } = flakyLoader(POOL, 1, 'timeout');
    const el = render({ config: CONFIG, loadPool: load });

    await vi.waitFor(() => {
      expect(el.querySelector('.fp-slot-stalled')).not.toBeNull();
    });
    // The message is the loader's, not a local one — the same decision the
    // browse skeleton renders.
    expect(el.querySelector('.fp-slot-stalled')?.textContent?.trim()).toBe(
      poolFailureMessage('timeout'),
    );
    // Every slot says so, and the grid is still the grid.
    expect(el.querySelectorAll('.fp-slot-stalled')).toHaveLength(2);
    expectGridChrome(el);
    expect(el.querySelector('.fp-slot-placeholder')).toBeNull();
    expect(attempts()).toBe(1);

    // One control for the whole page, because one fetch failed for it.
    const retries = el.querySelectorAll<HTMLButtonElement>('.fp-pool-retry');
    expect(retries).toHaveLength(1);
    retries[0].click();

    await vi.waitFor(() => {
      expect(el.querySelectorAll('.browse-card-item')).toHaveLength(2);
    });
    expect(attempts()).toBe(2);
    expect(el.querySelector('.fp-slot-stalled')).toBeNull();
    expect(el.querySelector('.fp-pool-retry')).toBeNull();
  });
});
