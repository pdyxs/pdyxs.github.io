// The filter shell against a fake pool (issue #152, slice 7 of
// docs/plans/shared-card-pool.md).
//
// Runs in the **island** vitest project, because it mounts a Svelte component.
// No `.astro` import may reach this file.
//
// What this asserts that the other cutover tests don't: the bar itself NEVER
// waits. #140's decision is that the buttons come from the static
// FIVE_W_DIMENSIONS and render at first paint, and only what goes *inside* a
// panel depends on the pool — so the interesting state is a bar that is fully
// drawn and fully disabled, which a test looking for a loading indicator would
// miss entirely.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount } from 'svelte';
import LensFilterShell from './LensFilterShell.svelte';
import { lensFilterStore } from '../stores/lens-filter-store';
import { emptyFilterState } from '../dimensions';
import { poolFailureMessage } from '../lib/browse-skeleton';
import { fakeCard, fakePool, pendingLoader, readyLoader, flakyLoader } from '../test/fake-card-pool';
import type { SharedCardPoolAsset } from '../lib/card-pool';
import type { LensDefinition } from '../lib/lens-registry';

const LENS = {
  id: 'interesting',
  label: 'Most* Interesting',
  acceptsFilters: true,
} as unknown as LensDefinition;

/** A pool whose `what` dimension actually has a value to show. */
function poolWithHierarchy(): SharedCardPoolAsset {
  return {
    ...fakePool([fakeCard('what/puzzles/fog')]),
    hierarchies: {
      what: [
        {
          value: 'what:puzzles',
          dimensionId: 'what',
          label: 'Puzzles',
          count: 1,
          declared: true,
          children: [],
        } as never,
      ],
    },
  };
}

let host: HTMLElement;
let app: ReturnType<typeof mount> | null = null;

function render(loadPool: () => Promise<SharedCardPoolAsset>) {
  app = mount(LensFilterShell, { target: host, props: { lens: LENS, loadPool } });
}

const buttons = () => [...host.querySelectorAll<HTMLButtonElement>('.browse-dim-btn')];

/** By label, never by index — FIVE_W_DIMENSIONS is who/what/when/where/why. */
const buttonFor = (label: string) =>
  buttons().find(b => b.textContent?.trim() === label)!;
// The loader's promise chain has to settle and Svelte has to flush the render
// it triggers; a macrotask covers both.
const flush = () => new Promise(resolve => setTimeout(resolve, 10));

beforeEach(() => {
  lensFilterStore.set(emptyFilterState());
  host = document.createElement('div');
  document.body.appendChild(host);
  window.history.replaceState(null, '', '/lens/interesting');
});

afterEach(() => {
  if (app) unmount(app);
  app = null;
  host.remove();
});

describe('the bar does not wait for the pool', () => {
  it('renders all five dimension buttons while the pool is in flight', () => {
    render(pendingLoader());
    expect(buttons()).toHaveLength(5);
    expect(buttons().map(b => b.textContent?.trim())).toEqual([
      'Who', 'What', 'When', 'Where', 'Why',
    ]);
  });

  it('disables every button until the pool lands, so no panel can open onto an empty list', () => {
    render(pendingLoader());
    expect(buttons().every(b => b.disabled)).toBe(true);
  });

  it('says the values are loading rather than claiming there are none', () => {
    render(pendingLoader());
    // The pre-existing tooltip — "No tags available for this dimension" — is a
    // LIE while the fetch is in flight, and it is the only thing on screen
    // that could explain the disabled button.
    expect(buttonFor('What').title).toBe('Loading filters…');
  });
});

describe('when the pool arrives', () => {
  it('enables the dimension that has values', async () => {
    render(readyLoader(poolWithHierarchy()));
    await flush();
    const what = buttonFor('What');
    expect(what.disabled).toBe(false);
    expect(what.title).toBe('');
  });

  it('leaves a genuinely empty dimension disabled, and says so honestly', async () => {
    render(readyLoader(poolWithHierarchy()));
    await flush();
    // `when` has no nodes in this pool — disabled for the ORIGINAL reason, and
    // the two reasons must not have collapsed into one message.
    const when = buttonFor('When');
    expect(when.disabled).toBe(true);
    expect(when.title).toBe('No tags available for this dimension');
  });

  it('opens a panel, which is the thing the pending state forbids', async () => {
    render(readyLoader(poolWithHierarchy()));
    await flush();
    // Queried off `document`, not `host`: DimensionPanel portals itself to
    // <body>, which is also why FilterBar's outside-click handler has to name
    // `.browse-dim-panel` explicitly.
    expect(document.querySelector('.browse-dim-panel')).toBeNull();

    buttonFor('What').click();
    await flush();

    // What the panel puts inside itself is DimensionPanel's business; that it
    // can be opened at all is this slice's, since a disabled button is the
    // whole of the pending contract.
    expect(document.querySelector('.browse-dim-panel')).not.toBeNull();
  });
});

describe('when the fetch fails', () => {
  it('states the failure and offers exactly one retry, not one per dimension', async () => {
    render(flakyLoader(poolWithHierarchy(), 1).load);
    await flush();
    expect(host.textContent).toContain(poolFailureMessage('network'));
    expect(host.querySelectorAll('.fp-pool-retry')).toHaveLength(1);
  });

  it('tells a disabled button the difference between failed and empty', async () => {
    render(flakyLoader(poolWithHierarchy(), 1).load);
    await flush();
    expect(buttonFor('What').title).toBe("Filters couldn't be loaded.");
  });

  it('retry makes a second attempt and enables the buttons', async () => {
    const { load, attempts } = flakyLoader(poolWithHierarchy(), 1);
    render(load);
    await flush();
    expect(attempts()).toBe(1);

    host.querySelector<HTMLButtonElement>('.fp-pool-retry')!.click();
    await flush();

    expect(attempts()).toBe(2);
    expect(buttonFor('What').disabled).toBe(false);
    expect(host.querySelector('.fp-pool-retry')).toBeNull();
  });
});
