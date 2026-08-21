// SSR prerender isolation (#102).
//
// `stackStore` is module-level and `astro build` prerenders every page in one
// process, so the store is per-visitor state on the client and per-*process*
// state on the server. The seed used to write only when both `activeUid` and
// `activeHtml` were present, so a render with neither inherited whatever the
// previously-prerendered page had left in the module.
//
// Every route currently supplies both props (LensPage.astro seeds `lens/<name>`
// for `/` too), which is why the leak never produced a visible symptom anyone
// found — it is latent, and one props-less <StackNav> call site brings it back.
// These tests hold the property at the island rather than at the route set.
//
// This test belongs to the `astro` vitest project, and deliberately so: its
// "ssr" vite environment is what makes Svelte's *server* renderer available,
// and the seed is a server-render effect. Rendering two pages back to back in
// one module instance is exactly what the prerenderer does — which the client
// mount tests in `CardStack.island.test.ts` could not reproduce, since there
// is no prerenderer in a browser.
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'svelte/server';
import { get } from 'svelte/store';
import CardStack from './CardStack.svelte';
import { stackStore, seedStackState } from '../stores/card-stack-store';

const CARD_UID = 'what/games/digital/numbeanies';
const CARD_HTML = `<div class="stack-card" data-uid="${CARD_UID}"><div class="card-header"></div></div>`;

/** One prerendered page: the props `StackNav.astro` passes for that route. */
function renderPage(props: { activeUid?: string; activeHtml?: string | null }) {
  return render(CardStack as any, { props }).body;
}

describe('prerendering one page does not leak into the next', () => {
  beforeEach(() => {
    stackStore.set(seedStackState(null));
  });

  it('leaves the store empty after a render with no active location', () => {
    renderPage({ activeUid: CARD_UID, activeHtml: CARD_HTML });
    expect(get(stackStore).activeSlot).toBe(CARD_UID);

    // The home page: no active location, so it must state the empty stack
    // rather than inheriting the card page's.
    renderPage({});
    expect(get(stackStore)).toEqual({ entries: [], activeSlot: null });
  });

  it('renders the home page identically whether or not a card page preceded it', () => {
    // The visible half of the leak: with an inherited stack, `#card-stack`
    // renders WITHOUT its `hidden` attribute and emits an empty
    // `.active-card-col` on a page that has no card at all. (The card's own
    // markup does not come with it — the fragment cache is per-instance — so
    // what a prerender would ship is an empty shell.)
    const cold = renderPage({});
    renderPage({ activeUid: CARD_UID, activeHtml: CARD_HTML });
    const afterCard = renderPage({});
    expect(afterCard).toBe(cold);
    expect(afterCard).toContain('hidden');
  });

  it('renders a card page identically whichever page was prerendered before it', () => {
    // Order-independence is the property the prerenderer needs: page output is
    // a function of that page's props alone.
    const cold = renderPage({ activeUid: CARD_UID, activeHtml: CARD_HTML });
    renderPage({ activeUid: 'what/puzzles/fog', activeHtml: '<div class="stack-card" data-uid="what/puzzles/fog"></div>' });
    const afterOther = renderPage({ activeUid: CARD_UID, activeHtml: CARD_HTML });
    expect(afterOther).toBe(cold);
  });
});
