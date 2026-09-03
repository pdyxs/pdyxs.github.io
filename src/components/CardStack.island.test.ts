// Client-mount tests for the card stack island (issue #95).
//
// This file runs in the **island** vitest project (vitest.island.config.ts), a
// plain Vite config with `@sveltejs/vite-plugin-svelte` and the `browser`
// resolve condition — which is what makes `mount()` work at all. Under the
// sibling `astro` project every import resolves through Astro's Vite config in
// the "ssr" environment, where Svelte is its server build and `mount()` throws
// `lifecycle_function_unavailable`.
//
// What that buys, and what it does not:
//
//   - Reachable: the mount path, `onMount`, `$effect`, the delegated click
//     handlers on `#card-stack` / `#homepage` / `document`, the `cardparam`
//     and `popstate` listeners, and every store mutation they make.
//   - Out of reach: View Transitions (happy-dom has no
//     `document.startViewTransition`, so `startVT` stays undefined and every
//     push takes the documented instant-fallback branch), real layout, and
//     CSS transitions.
//
// The rule the split imposes: **no `.astro` import may reach this file.** There
// is no Astro plugin in this project to transform one.
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { mount, unmount, tick, createRawSnippet } from 'svelte';
import { get } from 'svelte/store';
import CardStack from './CardStack.svelte';
import { stackStore, seedStackState } from '../stores/card-stack-store';
import { activeEntry } from '../lib/stack-layout';
import { deserialiseStack } from '../lib/stack-codec';
import { manifestLookup } from '../lib/stack-manifest-client';
import { tagManifestLookup } from '../lib/tag-manifest-client';
import { clearViewState, hasBeenRead } from '../lib/card-view-state';

const CARD_A = 'what/games/digital/numbeanies';
const CARD_B = 'what/puzzles/fog';
const CARD_C = 'what/art/lino-printing';

function fragment(uid: string, { hash = `hash-${uid}`, title = uid }: { hash?: string | null; title?: string } = {}) {
  return `<div class="stack-card" data-uid="${uid}"${hash ? ` data-content-hash="${hash}"` : ''}>` +
    // The sentinel and spine are in every real shell (CardStackCard.astro,
    // LensStackCard.astro and buildPlaceholderHtml), and the sticky-header
    // observer looks for the sentinel — so the fixture carries them too.
    `<div class="stack-card-spine"><div class="stack-card-spine-inner">` +
    `<span class="stack-card-spine-title">${title}</span></div></div>` +
    `<div class="card-header-sentinel"></div>` +
    `<div class="card-header"><span class="card-header-title">${title}</span>` +
    `<button class="stack-card-close" aria-label="Close">x</button></div>` +
    `<div class="body-wrapper"><div class="stack-card-body"><div class="stack-card-body-inner"></div></div></div>` +
    `</div>`;
}

/** A whole fetched document, which is what the stack actually requests. */
function page(url: string) {
  // `/fragment/lens/<name>` and `/card/<uid>` are the two shapes uidToFetchUrl
  // emits; a lens fragment carries no content hash, which is what keeps it out
  // of read state.
  if (url.startsWith('/fragment/lens/')) {
    const name = url.slice('/fragment/lens/'.length);
    return `<html><body>${fragment(`lens/${name}`, { hash: null })}</body></html>`;
  }
  return `<html><body>${fragment(url.replace(/^\/card\//, ''))}</body></html>`;
}

let component: Record<string, unknown> | null = null;
let target: HTMLElement;

/**
 * Mount the island the way `StackNav.astro` does, into a fresh document body.
 *
 * The active location is SLOT content now (issue #121), not an `activeHtml`
 * prop — Astro's Svelte renderer hands it over as a raw snippet wrapping the
 * markup in `<astro-slot>`, so that is exactly what these tests supply. The
 * helper still takes `activeHtml`: what each test is saying is "this card was
 * server-rendered", and how it reaches the island is this file's business, not
 * theirs.
 */
function mountStack(props: { activeUid?: string; activeHtml?: string | null; initialWidth?: string } = {}) {
  const { activeHtml, ...rest } = props;
  const children = activeHtml
    ? createRawSnippet(() => ({ render: () => `<astro-slot>${activeHtml}</astro-slot>` }))
    : undefined;
  target = document.createElement('div');
  document.body.appendChild(target);
  component = mount(CardStack as any, { target, props: { ...rest, children } }) as Record<string, unknown>;
  return component;
}

/** Let onMount's awaited work (fetches, initFromUrl) and the effects settle. */
async function settle() {
  for (let i = 0; i < 6; i++) await tick();
}

beforeEach(() => {
  document.body.innerHTML = '';
  clearViewState();
  stackStore.set(seedStackState(null));
  history.replaceState(null, '', '/');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    text: async () => page(url),
  })));
});

afterEach(() => {
  if (component) unmount(component as any);
  component = null;
  vi.unstubAllGlobals();
});

describe('mount', () => {
  it('renders the SSR-seeded card and records it as read', async () => {
    // #92: arriving at a card IS reading it. This was previously only assertable
    // as a source-level guard (CardStack.cold-load.test.ts) — here it is the
    // behaviour.
    mountStack({ activeUid: CARD_A, activeHtml: fragment(CARD_A) });
    await settle();

    expect(document.querySelector(`[data-uid="${CARD_A}"]`)).toBeTruthy();
    expect(get(stackStore).activeSlot).toBe(CARD_A);
    expect(hasBeenRead(CARD_A)).toBe(true);
  });

  it('records nothing for a lens location', async () => {
    // A lens is a listing with no single card identity — `readToRecord` is the
    // decision, this is that it is actually consulted on the mount path.
    mountStack({ activeUid: 'lens/interesting', activeHtml: fragment('lens/interesting', { hash: null }) });
    await settle();

    expect(get(stackStore).activeSlot).toBe('lens/interesting');
    expect(hasBeenRead('lens/interesting')).toBe(false);
  });

  it('hides the homepage when a card is seeded, and leaves it alone when none is', async () => {
    const homepage = document.createElement('div');
    homepage.id = 'homepage';
    document.body.appendChild(homepage);

    mountStack({});
    await settle();
    expect(homepage.hidden).toBe(false);
    unmount(component as any);
    component = null;

    mountStack({ activeUid: CARD_A, activeHtml: fragment(CARD_A) });
    await settle();
    expect(homepage.hidden).toBe(true);
  });

  it('marks the stack hidden with no entries', async () => {
    mountStack({});
    await settle();
    expect(document.getElementById('card-stack')?.hasAttribute('hidden')).toBe(true);
  });
});

describe('delegated click → push', () => {
  it('fetches, stacks and activates a [data-push-card] target inside the stack', async () => {
    mountStack({ activeUid: CARD_A, activeHtml: fragment(CARD_A) });
    await settle();

    const link = document.createElement('a');
    link.href = `/card/${CARD_B}`;
    link.dataset.pushCard = CARD_B;
    document.querySelector('.stack-card-body-inner')!.appendChild(link);
    link.click();
    await settle();

    const state = get(stackStore);
    expect(state.entries.map(e => e.key)).toEqual([CARD_A, CARD_B]);
    expect(state.activeSlot).toBe(CARD_B);
    // The push is a stack navigation, not a page load: the URL moved, and the
    // browser never followed the href.
    expect(window.location.pathname).toContain(CARD_B);
    expect(hasBeenRead(CARD_B)).toBe(true);
  });

  it('stacks a double-clicked link ONCE, not twice (#112)', async () => {
    // `pushCard` awaits (a fetch, a view transition, a tick) before it mutates
    // the store, so a second click during that window used to run against the
    // same snapshot: neither invocation could see the other's push, and both
    // handed `withFreeSlot` identical entries — so both allocated the SAME
    // slot, which slots exist to make unrepresentable (#106).
    mountStack({ activeUid: CARD_A, activeHtml: fragment(CARD_A) });
    await settle();

    const link = document.createElement('a');
    link.dataset.pushCard = CARD_B;
    document.querySelector('.stack-card-body-inner')!.appendChild(link);
    // No await between them: this is the impatient double-click.
    link.click();
    link.click();
    await settle();

    const state = get(stackStore);
    expect(state.entries.map(e => e.key)).toEqual([CARD_A, CARD_B]);
    // The invariant the bug broke, stated directly.
    const slots = state.entries.map(e => e.slot);
    expect(new Set(slots).size).toBe(slots.length);
    expect(state.activeSlot).toBe(CARD_B);
    // And exactly one node, so the keyed each block has nothing to collide on.
    expect(document.querySelectorAll(`[data-uid="${CARD_B}"]`)).toHaveLength(1);
  });

  it('a second push of a DIFFERENT location still lands (#112)', async () => {
    // The guard is per-location, not a global lock: two quick clicks on two
    // different links are two navigations and both must arrive.
    mountStack({ activeUid: CARD_A, activeHtml: fragment(CARD_A) });
    await settle();

    const body = document.querySelector('.stack-card-body-inner')!;
    const first = document.createElement('a');
    first.dataset.pushCard = CARD_B;
    const second = document.createElement('a');
    second.dataset.pushCard = CARD_C;
    body.append(first, second);

    first.click();
    second.click();
    await settle();

    const state = get(stackStore);
    expect(state.entries.map(e => e.key)).toEqual([CARD_A, CARD_B, CARD_C]);
    expect(state.activeSlot).toBe(CARD_C);
  });

  it('re-activates an entry already in the stack instead of pushing a duplicate', async () => {
    mountStack({ activeUid: CARD_A, activeHtml: fragment(CARD_A) });
    await settle();

    const link = document.createElement('a');
    link.dataset.pushCard = CARD_B;
    document.querySelector('.stack-card-body-inner')!.appendChild(link);
    link.click();
    await settle();
    expect(get(stackStore).entries).toHaveLength(2);

    // Now click a link back to the card underneath.
    const back = document.createElement('a');
    back.dataset.pushCard = CARD_A;
    document.querySelector(`[data-uid="${CARD_B}"] .stack-card-body-inner`)!.appendChild(back);
    back.click();
    await settle();

    const state = get(stackStore);
    expect(state.entries.map(e => e.key)).toEqual([CARD_A, CARD_B]);
    expect(state.activeSlot).toBe(CARD_A);
  });

  it('pushes a card: protocol link from anywhere in the document', async () => {
    mountStack({ activeUid: CARD_A, activeHtml: fragment(CARD_A) });
    await settle();

    const link = document.createElement('a');
    link.setAttribute('href', `card:${CARD_B}`);
    document.body.appendChild(link);
    link.click();
    await settle();

    expect(get(stackStore).activeSlot).toBe(CARD_B);
  });

  // Issue: selecting a lens from the dimension bar did nothing at all.
  //
  // `[data-replace-slot]` used to be handled in `onStackClick`, bound to
  // `#card-stack`. DimensionPanel portals itself to <body> to escape the
  // stack's clipping ancestors, so its lens rows are NOT in that subtree and
  // the handler never fired — no error, no navigation, nothing. Containment
  // was never the right test: of the three emitters, only the strip's terminal
  // tile is actually inside the stack.
  //
  // The first test is the regression; the second is the one it must not break.
  it('replaces the active slot from a [data-replace-slot] OUTSIDE the stack', async () => {
    mountStack({ activeUid: 'lens/home', activeHtml: fragment('lens/home', { hash: null }) });
    await settle();

    // Where a portaled DimensionPanel's lens row lives: <body>, not #card-stack.
    const item = document.createElement('button');
    item.dataset.replaceSlot = 'lens/interesting';
    item.dataset.replaceParams = '';
    document.body.appendChild(item);
    expect(item.closest('#card-stack')).toBeNull();

    item.click();
    await settle();

    const state = get(stackStore);
    expect(activeEntry(state)?.key).toBe('lens/interesting');
    expect(state.entries.map(e => e.key)).toEqual(['lens/interesting']);
  });

  it('still replaces from a [data-replace-slot] INSIDE the stack', async () => {
    mountStack({ activeUid: 'lens/newest', activeHtml: fragment('lens/newest', { hash: null }) });
    await settle();

    // Where the capped strip's terminal tile lives (CardStrip.svelte).
    const tile = document.createElement('button');
    tile.dataset.replaceSlot = 'lens/interesting';
    tile.dataset.replaceParams = '';
    document.querySelector('.stack-card-body-inner')!.appendChild(tile);

    tile.click();
    await settle();

    expect(activeEntry(get(stackStore))?.key).toBe('lens/interesting');
  });

  it('activates a collapsed card when it is clicked', async () => {
    mountStack({ activeUid: CARD_A, activeHtml: fragment(CARD_A) });
    await settle();
    const link = document.createElement('a');
    link.dataset.pushCard = CARD_B;
    document.querySelector('.stack-card-body-inner')!.appendChild(link);
    link.click();
    await settle();

    const collapsed = document.querySelector<HTMLElement>(`[data-uid="${CARD_A}"]`)!;
    expect(collapsed.classList.contains('stack-card--collapsed')).toBe(true);
    collapsed.querySelector<HTMLElement>('.card-header')!.click();
    await settle();

    expect(get(stackStore).activeSlot).toBe(CARD_A);
  });
});

describe('placeholder titles (#105)', () => {
  // `what/art/lino-printing` carries a title in the manifest; CARD_B
  // (`what/puzzles/fog`) is deliberately absent from it, which is what makes it
  // the fallback case. CARD_A is numbeanies and is already mounted, so it is no
  // use as a push target here.
  //
  // The expected title is READ from the manifest rather than written out: what
  // is under test is that the placeholder paints the manifest's title instead
  // of the uid, and hardcoding the string turns every retitle of that card into
  // a failure of this test.
  const LINO = 'what/art/lino-printing';
  const LINO_TITLE = manifestLookup.titleForUid(LINO)!;

  /**
   * The placeholder path needs a view transition, and happy-dom has none — so
   * every other test in this file takes the instant-fallback branch and never
   * seeds a placeholder at all. This stub is the smallest thing `performPush`
   * needs: run the callback, then settle.
   */
  function stubViewTransitions() {
    (document as any).startViewTransition = (cb: () => void) => {
      cb();
      return { finished: Promise.resolve() };
    };
  }

  /** A fetch that hands back a promise the test resolves by hand. */
  function deferredFetch() {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      await gate;
      return { ok: true, text: async () => page(url) };
    }));
    return release;
  }

  /**
   * A push link shaped like the real ones. `.card-link` matters: the delegated
   * handler passes `pushItem.closest('.card-link')` as the clicked link, and a
   * push with no clicked link skips the placeholder entirely.
   */
  function pushLink(uid: string, label?: string) {
    const link = document.createElement('a');
    link.className = 'card-link';
    link.dataset.pushCard = uid;
    if (label) link.innerHTML = `<span class="card-header-title">${label}</span>`;
    document.querySelector(`[data-uid="${CARD_A}"] .stack-card-body-inner`)!.appendChild(link);
    return link;
  }

  const titleOf = (uid: string, sel = '.card-header-title') =>
    document.querySelector(`[data-uid="${uid}"] ${sel}`)?.textContent?.trim();

  afterEach(() => { delete (document as any).startViewTransition; });

  it('titles an in-flight placeholder from the manifest, never the uid', async () => {
    stubViewTransitions();
    mountStack({ activeUid: CARD_A, activeHtml: fragment(CARD_A) });
    await settle();

    const release = deferredFetch();
    // No `.card-header-title` inside the link — a browse tile, which is
    // exactly the case the ticket describes.
    pushLink(LINO).click();
    await settle();

    // Still in flight: this is the placeholder, and it is what the visitor sees.
    expect(titleOf(LINO)).toBe(LINO_TITLE);
    // The spine carries it too — and through the spine, #111's pile bands.
    expect(titleOf(LINO, '.stack-card-spine-title')).toBe(LINO_TITLE);
    expect(document.querySelector(`[data-uid="${LINO}"]`)!.textContent).not.toContain(LINO);

    release();
    await settle();
  });

  it('prefers the manifest to the clicked link, which may be contextual', async () => {
    stubViewTransitions();
    mountStack({ activeUid: CARD_A, activeHtml: fragment(CARD_A) });
    await settle();

    const release = deferredFetch();
    pushLink(LINO, 'A print I made').click();
    await settle();

    expect(titleOf(LINO)).toBe(LINO_TITLE);

    release();
    await settle();
  });

  it('falls back to the clicked link when the manifest knows nothing', async () => {
    stubViewTransitions();
    mountStack({ activeUid: CARD_A, activeHtml: fragment(CARD_A) });
    await settle();

    const release = deferredFetch();
    pushLink(CARD_B, 'Clicked Label').click();
    await settle();

    expect(titleOf(CARD_B)).toBe('Clicked Label');

    release();
    await settle();
  });

  it('replaces a guessed title with the real one once the fragment lands', async () => {
    // The placeholder's shell is permanent — only the body is swapped — so the
    // correction has to be `replaceBody` copying titles across, not a re-render.
    stubViewTransitions();
    mountStack({ activeUid: CARD_A, activeHtml: fragment(CARD_A) });
    await settle();

    const release = deferredFetch();
    pushLink(CARD_B, 'Stale Guess').click();
    await settle();
    expect(titleOf(CARD_B)).toBe('Stale Guess');

    release();
    await settle();

    // `page()` renders CARD_B titled with its uid, which stands in for whatever
    // the server sends — the point is that the DOM now says what the FRAGMENT
    // says, in the header and in the spine.
    expect(titleOf(CARD_B)).toBe(CARD_B);
    expect(titleOf(CARD_B, '.stack-card-spine-title')).toBe(CARD_B);
  });
});

describe('close', () => {
  it('trims the stack back to the entries before the closed card', async () => {
    mountStack({ activeUid: CARD_A, activeHtml: fragment(CARD_A) });
    await settle();
    const link = document.createElement('a');
    link.dataset.pushCard = CARD_B;
    document.querySelector('.stack-card-body-inner')!.appendChild(link);
    link.click();
    await settle();
    expect(get(stackStore).entries).toHaveLength(2);

    document.querySelector<HTMLElement>(`[data-uid="${CARD_B}"] .stack-card-close`)!.click();
    await settle();

    const state = get(stackStore);
    expect(state.entries.map(e => e.key)).toEqual([CARD_A]);
    expect(state.activeSlot).toBe(CARD_A);
  });

  it('closing the last card animates it shut, then lands on the home lens', async () => {
    // The close-to-EMPTY path — a deep-linked card closed with nothing behind
    // it — which nothing covered before #104 touched the wait inside it.
    //
    // happy-dom runs no CSS, so `transitionend` never fires on its own: the
    // synthetic event below is what stands in for the collapse finishing, and
    // dispatching it is also the assertion that the listener is wired at all.
    // Without it this would fall through to the 400ms fallback instead.
    mountStack({ activeUid: CARD_A, activeHtml: fragment(CARD_A) });
    await settle();
    expect(get(stackStore).entries).toHaveLength(1);

    const bodyWrapper = document.querySelector<HTMLElement>(`[data-uid="${CARD_A}"] .body-wrapper`)!;
    document.querySelector<HTMLElement>(`[data-uid="${CARD_A}"] .stack-card-close`)!.click();
    await tick();

    // The card is animating shut, and the stack has not moved yet.
    expect(bodyWrapper.classList.contains('open')).toBe(false);
    expect(get(stackStore).activeSlot).toBe(CARD_A);

    const ended = new Event('transitionend');
    Object.defineProperty(ended, 'propertyName', { value: 'grid-template-rows' });
    bodyWrapper.dispatchEvent(ended);
    await settle();

    const state = get(stackStore);
    expect(state.entries.map(e => e.key)).toEqual(['lens/home']);
    expect(state.activeSlot).toBe('lens/home');
    expect(window.location.pathname).toBe('/');
  });
});

describe('the layout effect applies the store to the DOM', () => {
  /** Push CARD_B on top of CARD_A and return both nodes. */
  async function pushSecondCard() {
    mountStack({ activeUid: CARD_A, activeHtml: fragment(CARD_A) });
    await settle();
    const link = document.createElement('a');
    link.dataset.pushCard = CARD_B;
    document.querySelector('.stack-card-body-inner')!.appendChild(link);
    link.click();
    await settle();
  }

  const el = (uid: string) => document.querySelector<HTMLElement>(`[data-uid="${uid}"]`)!;

  it('marks exactly one card active and the rest collapsed', async () => {
    await pushSecondCard();

    const active = document.querySelectorAll('.stack-card--active');
    expect(active).toHaveLength(1);
    expect((active[0] as HTMLElement).dataset.uid).toBe(CARD_B);
    expect(el(CARD_A).classList.contains('stack-card--collapsed')).toBe(true);
  });

  it('opens the body of EVERY card, not just the active one', async () => {
    // Trap 1 of #109, and the inversion it forced. Desktop collapse is a crop —
    // a covered card's body stays open and is occluded by the spine in front of
    // it — while mobile collapses by reflow. The island cannot tell those apart
    // without the banned breakpoint detection, so it opens unconditionally and
    // the MOBILE media block takes it back.
    await pushSecondCard();

    for (const uid of [CARD_A, CARD_B]) {
      expect(el(uid).querySelector('.body-wrapper')!.classList.contains('open')).toBe(true);
    }
  });

  it('writes the geometry onto each card as custom properties', async () => {
    await pushSecondCard();

    const behind = el(CARD_A);
    const active = el(CARD_B);
    expect(active.dataset.role).toBe('active');
    expect(behind.dataset.role).toBe('behind');
    // One step behind, at the settled collapsedWidth 40 / stagger 8.
    expect(behind.style.getPropertyValue('--geo-left')).toBe('-40px');
    expect(behind.style.getPropertyValue('--geo-top')).toBe('-8px');
    expect(active.style.getPropertyValue('--geo-left')).toBe('0px');
    // Painting order is the occlusion, so z follows stack order.
    expect(Number(active.style.getPropertyValue('--geo-z')))
      .toBeGreaterThan(Number(behind.style.getPropertyValue('--geo-z')));
    // The ramp, resolved to a token reference because CSS cannot index by
    // number: the active card is the anchor (ditherMid 5), behind steps -2.
    expect(active.style.getPropertyValue('--card-surface')).toBe('var(--dither-5)');
    expect(behind.style.getPropertyValue('--card-surface')).toBe('var(--dither-3)');
    // The fans' widths, so CSS can subtract them from the viewport.
    const stack = document.getElementById('card-stack')!;
    expect(stack.style.getPropertyValue('--behind-slots')).toBe('1');
    expect(stack.style.getPropertyValue('--ahead-slots')).toBe('0');
  });

  it('keeps the same DOM nodes when the active card changes', async () => {
    // The one automated guard against trap 4 of #109. A card left out of the
    // geometry — or an `{#each}` re-keyed on identity — is a DOM node that gets
    // destroyed and rebuilt, so it MOUNTS at its destination instead of
    // travelling there and nothing animates. That failure is invisible at rest
    // and invisible to getBoundingClientRect, which is exactly how it survived
    // four rounds of screenshot verification in #98.
    await pushSecondCard();
    const before = [el(CARD_A), el(CARD_B)];

    // Re-activate the card underneath: the active index moves, both cards stay.
    before[0].querySelector<HTMLElement>('.card-header')!.click();
    await settle();

    expect(get(stackStore).activeSlot).toBe(CARD_A);
    expect(el(CARD_A)).toBe(before[0]);
    expect(el(CARD_B)).toBe(before[1]);
    // ...and the roles swapped on those same nodes.
    expect(before[0].dataset.role).toBe('active');
    expect(before[1].dataset.role).toBe('ahead');
  });
});

describe('one scroll owner (#110)', () => {
  /** The four `scrollIntoView({ block: "nearest" })` sites are gone; every
   *  navigation now goes through one `window.scrollTo`. */
  function captureScrolls() {
    const calls: ScrollToOptions[] = [];
    vi.stubGlobal('scrollTo', vi.fn((opts: ScrollToOptions) => { calls.push(opts); }));
    return calls;
  }

  /** Puts a card's top edge at a known viewport offset, so the target the
   *  applier computes is checkable rather than the happy-dom default of 0.
   *  Pass a function to make the offset MOVE between frames, which is what a
   *  mobile collapse does to everything below it. */
  function placeCard(uid: string, top: number | (() => number)) {
    const el = document.querySelector<HTMLElement>(`[data-uid="${uid}"]`)!;
    const at = typeof top === 'function' ? top : () => top;
    el.getBoundingClientRect = () => {
      const y = at();
      return ({ top: y, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y, toJSON: () => ({}) }) as DOMRect;
    };
    return el;
  }

  /** The applier waits for the layout to stop moving before it aims, so a test
   *  that only awaits microtasks never sees the scroll. Drains the rAF loop. */
  async function settleFrames(n = 8) {
    for (let i = 0; i < n; i++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
    await tick();
  }

  it('scrolls to the newly active card, not into view of it', async () => {
    const calls = captureScrolls();
    mountStack({ activeUid: CARD_A, activeHtml: fragment(CARD_A) });
    await settle();
    // The mount aims too, and its settle loop outlives `settle()` — drain it
    // before clearing, or the cold-load scroll is counted as the push's.
    await settleFrames();
    calls.length = 0;

    const link = document.createElement('a');
    link.dataset.pushCard = CARD_B;
    document.querySelector('.stack-card-body-inner')!.appendChild(link);
    placeCard(CARD_A, 0);
    link.click();
    await settle();
    await settleFrames();

    expect(calls.length).toBeGreaterThan(0);
    // No peek resolves in happy-dom (no stylesheet), so the target is the
    // card's own document offset — which is the arithmetic, less nothing.
    expect(calls.at(-1)!.top).toBe(0);
    // Nothing calls the old primitive any more.
    expect(document.querySelector(`[data-uid="${CARD_B}"]`)).toBeTruthy();
  });

  it('does NOT scroll when a lens re-keys, because the visitor has not moved', async () => {
    // A filter toggle changes the active entry's identity but leaves the
    // visitor standing in front of the same card. Yanking the viewport for that
    // is worse than not scrolling at all, so the effect is keyed on the stack's
    // SHAPE (active slot + depth) rather than on any store change.
    const calls = captureScrolls();
    mountStack({ activeUid: 'lens/interesting', activeHtml: fragment('lens/interesting', { hash: null }) });
    await settle();
    await settleFrames();
    calls.length = 0;

    document.dispatchEvent(new CustomEvent('cardparam', {
      detail: { uid: 'lens/interesting', params: [['filter.what', 'what:puzzles']] },
    }));
    await settle();
    await settleFrames();

    expect(get(stackStore).entries[0].key).toContain('filter.what');
    expect(calls).toHaveLength(0);
  });

  it('scrolls again when an entry is spliced in AHEAD of the active card', async () => {
    // initFromUrl restores `from` locations by inserting them before the active
    // one, which pushes it down the page without changing which location is
    // active. Depth is in the signature precisely so this still corrects.
    const calls = captureScrolls();
    mountStack({ activeUid: CARD_A, activeHtml: fragment(CARD_A) });
    await settle();
    await settleFrames();
    calls.length = 0;

    stackStore.update(s => ({ ...s, entries: [{ key: CARD_B, uid: CARD_B, slot: CARD_B }, ...s.entries] }));
    await settle();
    await settleFrames();

    expect(calls.length).toBeGreaterThan(0);
  });

  it('waits for a moving layout before aiming, and aims at where the card ENDS', async () => {
    // The mobile bug. A collapse there is a reflow, not a crop: the outgoing
    // card's body animates to nothing and carries the card being navigated to
    // up the page with it. Aimed at the first measurement, a push out of a long
    // lens aimed at a 12000px document and landed in a 1175px one, 254px past
    // its own header.
    const calls = captureScrolls();
    mountStack({ activeUid: CARD_A, activeHtml: fragment(CARD_A) });
    await settle();
    await settleFrames();
    calls.length = 0;

    // CARD_B travels from 9000 to 0 as the card above it collapses, then rests.
    let top = 9000;
    const link = document.createElement('a');
    link.dataset.pushCard = CARD_B;
    document.querySelector('.stack-card-body-inner')!.appendChild(link);
    link.click();
    await settle();
    placeCard(CARD_B, () => top);

    // While it is still moving, nothing is aimed at all.
    for (const step of [6000, 3000, 900]) {
      top = step;
      await settleFrames(1);
      expect(calls).toHaveLength(0);
    }

    top = 0;
    await settleFrames();

    // One scroll, and it used the RESTING offset — never one of the four
    // positions the card held on the way there.
    expect(calls).toHaveLength(1);
    expect(calls[0].top).toBe(0);
  });

  it('abandons a settle still running when the next navigation starts', async () => {
    // Two loops aiming at different cards would both fire, and the older one
    // would land last — leaving the visitor in front of the card they just
    // navigated away from.
    const calls = captureScrolls();
    mountStack({ activeUid: CARD_A, activeHtml: fragment(CARD_A) });
    await settle();

    const link = document.createElement('a');
    link.dataset.pushCard = CARD_B;
    document.querySelector('.stack-card-body-inner')!.appendChild(link);
    link.click();
    await settle();
    calls.length = 0;

    // Re-activate CARD_A before the push's settle has come to rest.
    placeCard(CARD_A, 400);
    document.querySelector<HTMLElement>(`[data-uid="${CARD_A}"] .card-header`)!.click();
    await settle();
    await settleFrames();

    expect(get(stackStore).activeSlot).toBe(CARD_A);
    // Only the surviving loop aimed, and it aimed at the card now active.
    expect(calls).toHaveLength(1);
    expect(calls[0].top).toBe(400);
  });
});

describe('the sticky active header (#110)', () => {
  it('compacts only the ACTIVE card, and releases the class when it stops being active', async () => {
    // Driven by an IntersectionObserver on the 1px sentinel, so the test drives
    // the observer's callback rather than a scroll — which is the whole reason
    // it is an observer and not a scroll listener.
    const observers: Array<{ el: Element; cb: IntersectionObserverCallback }> = [];
    vi.stubGlobal('IntersectionObserver', class {
      cb: IntersectionObserverCallback;
      constructor(cb: IntersectionObserverCallback) { this.cb = cb; }
      observe(el: Element) { observers.push({ el, cb: this.cb }); }
      disconnect() {}
      unobserve() {}
    });

    mountStack({ activeUid: CARD_A, activeHtml: fragment(CARD_A) });
    await settle();

    const header = document.querySelector<HTMLElement>(`[data-uid="${CARD_A}"] .card-header`)!;
    const watching = observers.at(-1)!;
    expect(watching.el.classList.contains('card-header-sentinel')).toBe(true);

    // Sentinel leaves the viewport → the header is carrying the page.
    watching.cb([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(header.classList.contains('card-header--stuck')).toBe(true);

    // ...and back.
    watching.cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(header.classList.contains('card-header--stuck')).toBe(false);

    // Stuck, then pushed behind: it must not keep a scrolled appearance for
    // the next time it is opened.
    watching.cb([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(header.classList.contains('card-header--stuck')).toBe(true);
    const link = document.createElement('a');
    link.dataset.pushCard = CARD_B;
    document.querySelector('.stack-card-body-inner')!.appendChild(link);
    link.click();
    await settle();
    expect(header.classList.contains('card-header--stuck')).toBe(false);
  });
});

describe('lens identity (#100)', () => {
  // Previously reachable only as source-level guards
  // (CardStack.lens-identity.test.ts). These are the same rulings as behaviour.

  it('two differently-filtered links to one lens are two locations', async () => {
    mountStack({ activeUid: CARD_A, activeHtml: fragment(CARD_A) });
    await settle();

    const norway = document.createElement('a');
    norway.setAttribute('href', 'tag:where:europe/norway');
    document.body.appendChild(norway);
    norway.click();
    await settle();

    const puzzles = document.createElement('a');
    puzzles.setAttribute('href', 'tag:what:puzzles');
    document.body.appendChild(puzzles);
    puzzles.click();
    await settle();

    const state = get(stackStore);
    expect(state.entries).toHaveLength(3);
    // Same lens uid, two distinct identity keys — the second link pushed rather
    // than jumping back to the one already in the stack.
    const lenses = state.entries.filter(e => e.uid.startsWith('lens/'));
    expect(lenses).toHaveLength(2);
    expect(new Set(lenses.map(e => e.uid)).size).toBe(1);
    expect(new Set(lenses.map(e => e.key)).size).toBe(2);
    // ...and two distinct DOM handles, so both can mount side by side.
    expect(new Set(lenses.map(e => e.slot)).size).toBe(2);
    expect(document.querySelectorAll('[data-uid^="lens/"]')).toHaveLength(2);
  });

  it('a filter report re-keys the active lens entry and keeps its DOM handle', async () => {
    mountStack({ activeUid: 'lens/interesting', activeHtml: fragment('lens/interesting', { hash: null }) });
    await settle();

    const before = get(stackStore).entries[0];
    expect(before.key).toBe('lens/interesting');

    document.dispatchEvent(new CustomEvent('cardparam', {
      detail: { uid: 'lens/interesting', params: [['filter.what', 'what:puzzles']] },
    }));
    await settle();

    const after = get(stackStore).entries[0];
    expect(after.uid).toBe('lens/interesting');
    // The identity moved...
    expect(after.key).not.toBe(before.key);
    expect(after.key).toBe('lens/interesting?filter.what=what%3Apuzzles');
    expect(activeEntry(get(stackStore))!.key).toBe(after.key);
    // ...but the handle did not, so the reporting island survives its own report.
    expect(after.slot).toBe(before.slot);
    expect(document.querySelectorAll('.stack-card')).toHaveLength(1);
    // And the selection reached the URL.
    expect(window.location.search).toContain('what%3Apuzzles');
  });
});

describe('a lens in the stack names its filters', () => {
  // A fragment is fetched by uid, so it always renders its lens UNFILTERED —
  // the filters live in the location's key. Without the applier, two views of
  // one lens sitting side by side in the stack both read "Most* Interesting"
  // and nothing on screen says which is which.
  const titles = (slot: string) => {
    const el = document.querySelector(`[data-uid="${CSS.escape(slot)}"]`)!;
    return [
      el.querySelector('.card-header-title')!.textContent,
      el.querySelector('.stack-card-spine-title')!.textContent,
    ];
  };

  it('a filter toggle repaints the active lens title, header and spine', async () => {
    mountStack({ activeUid: 'lens/newest', activeHtml: fragment('lens/newest', { hash: null }) });
    await settle();
    expect(titles('lens/newest')).toEqual(['Newest', 'Newest']);

    document.dispatchEvent(new CustomEvent('cardparam', {
      detail: { uid: 'lens/newest', params: [['filter.what', 'what:puzzles']] },
    }));
    await settle();

    expect(titles('lens/newest')).toEqual(['Newest · Puzzles', 'Newest · Puzzles']);
  });

  it('a lens pushed with filters says so, once its fragment lands', async () => {
    // The fetched fragment titles itself "lens/newest" (the fixture's uid) and
    // `syncTitles` copies that onto the mounted card — the applier runs after.
    mountStack({ activeUid: CARD_A, activeHtml: fragment(CARD_A) });
    await settle();

    const link = document.createElement('a');
    link.setAttribute('href', 'tag:what:puzzles');
    document.body.appendChild(link);
    link.click();
    await settle();

    const lens = get(stackStore).entries.find(e => e.uid.startsWith('lens/'))!;
    expect(titles(lens.slot)).toEqual([
      'Most* Interesting · Puzzles',
      'Most* Interesting · Puzzles',
    ]);
  });
});

describe('cold-load stack skeleton (#101)', () => {
  // `CARD_A` and `CARD_B` are real uids, so the shipped manifest has codes AND
  // titles for both — which is the whole premise: the browser knows every
  // entry's title before it knows anything else about it.
  const codeFor = (uid: string) => manifestLookup.codeForUid(uid)!;

  /** Hold every fragment fetch open, so the pre-arrival state can be observed. */
  function deferFetches() {
    const release: Array<() => void> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      await new Promise<void>(r => release.push(r));
      return { ok: true, text: async () => page(url) };
    }));
    return () => { for (const r of release.splice(0)) r(); };
  }

  it('paints the whole stack shape before any fragment arrives', async () => {
    // The bug: the restore used to await each fetch and splice its entry in
    // when the HTML landed, so a deep link painted the active card alone and
    // then grew a fan one card at a time — moving the card you came to read on
    // every step.
    const releaseAll = deferFetches();
    history.replaceState(null, '', `/card/${CARD_B}?from=${codeFor(CARD_A)}`);
    mountStack({ activeUid: CARD_B, activeHtml: fragment(CARD_B) });
    await settle();

    // Nothing has been fetched yet, and the stack is already the right shape.
    const state = get(stackStore);
    expect(state.entries.map(e => e.key)).toEqual([CARD_A, CARD_B]);
    expect(state.activeSlot).toBe(CARD_B);
    expect(document.querySelectorAll('.stack-card')).toHaveLength(2);

    releaseAll();
    await settle();
  });

  it('titles the placeholder from the manifest, not from its uid', async () => {
    const releaseAll = deferFetches();
    history.replaceState(null, '', `/card/${CARD_B}?from=${codeFor(CARD_A)}`);
    mountStack({ activeUid: CARD_B, activeHtml: fragment(CARD_B) });
    await settle();

    const spine = document.querySelector(`[data-uid="${CARD_A}"] .stack-card-spine-title`);
    const expected = manifestLookup.titleForUid(CARD_A);
    expect(expected).toBeTruthy();
    expect(spine?.textContent).toBe(expected);
    // A collapsed card IS its spine title, so the skeleton is a legible
    // breadcrumb rather than a blank box — and a uid would read as a bug.
    expect(spine?.textContent).not.toBe(CARD_A);

    releaseAll();
    await settle();
  });

  it('keeps the same DOM node when the real fragment lands', async () => {
    // The trap this guards: `StackFragment` reads its html prop once, so the
    // fill-in has to go through `replaceBody` and patch the mounted node. A
    // bare cache write would either do nothing visible or (before #109's
    // freeze) destroy and rebuild the node.
    const releaseAll = deferFetches();
    history.replaceState(null, '', `/card/${CARD_B}?from=${codeFor(CARD_A)}`);
    mountStack({ activeUid: CARD_B, activeHtml: fragment(CARD_B) });
    await settle();

    const before = document.querySelector(`[data-uid="${CARD_A}"]`);
    expect(before).toBeTruthy();

    releaseAll();
    await settle();

    expect(document.querySelector(`[data-uid="${CARD_A}"]`)).toBe(before);
    // ...and the real content actually arrived in it.
    expect(get(stackStore).entries.map(e => e.key)).toEqual([CARD_A, CARD_B]);
  });

  it('drops an entry whose fragment never arrives', async () => {
    // The shape is optimistic, so a 404 has to be taken back — otherwise the
    // stack keeps a skeleton that will never fill.
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (
      url.includes(CARD_A) ? { ok: false, text: async () => '' } : { ok: true, text: async () => page(url) }
    )));
    history.replaceState(null, '', `/card/${CARD_B}?from=${codeFor(CARD_A)}`);
    mountStack({ activeUid: CARD_B, activeHtml: fragment(CARD_B) });
    await settle();

    expect(get(stackStore).entries.map(e => e.key)).toEqual([CARD_B]);
    expect(document.querySelector(`[data-uid="${CARD_A}"]`)).toBeNull();
  });
  // ── The skeleton the head script draws before paint (#122) ──
  /** What Base.astro's head script draws and StackNav inserts, before paint. */
  function drawSkeleton() {
    const layer = document.createElement('div');
    layer.className = 'stack-skeleton';
    layer.innerHTML = '<div class="stack-skeleton-inner"><div class="stack-skeleton-card"></div></div>';
    document.body.appendChild(layer);
    return layer;
  }

  it('drops it as soon as the real spines are in the DOM, not when they fill', async () => {
    // The skeleton stands in for the fan's SHAPE, and the shape lands in one
    // store write (#101) — long before any fragment arrives. Waiting for the
    // fetches would leave a drawn fan and a drawn skeleton on screen together.
    const releaseAll = deferFetches();
    drawSkeleton();
    history.replaceState(null, '', `/card/${CARD_B}?from=${codeFor(CARD_A)}`);
    mountStack({ activeUid: CARD_B, activeHtml: fragment(CARD_B) });
    await settle();

    expect(document.querySelectorAll('.stack-card')).toHaveLength(2);
    expect(document.querySelector('.stack-skeleton')).toBeNull();

    releaseAll();
    await settle();
  });

  it('drops it even when the codec resolves no fan at all', async () => {
    // `initFromUrl` returns early when the decoded stack is one entry deep,
    // before it ever splices anything — and that exit needs the dismissal too.
    // The two counts CAN disagree: the head script counted separators in the
    // raw `from`, and the codec is what decides how many entries those become.
    // Left drawn, the skeleton would sit there for the session promising cards
    // that are never coming.
    drawSkeleton();
    history.replaceState(null, '', `/card/${CARD_B}`);
    mountStack({ activeUid: CARD_B, activeHtml: fragment(CARD_B) });
    await settle();

    expect(get(stackStore).entries).toHaveLength(1);
    expect(document.querySelector('.stack-skeleton')).toBeNull();
  });
});

describe('two identical locations coexist (#106)', () => {
  // The exact route the ticket names, walked end to end:
  //
  //   1. you are on lens/interesting, unfiltered
  //   2. you open a card from it — the unfiltered lens is now behind you
  //   3. you follow a `tag:` link, which PUSHES lens/interesting?filter.what=…
  //      (that push is #100's whole point; before it, this jumped backwards)
  //   4. you clear the filter on that lens — its key re-keys to step 1's key
  //
  // The ruling is that both entries stay. A stack is the path you walked, and
  // a path that passes the same place twice is normal.
  const LENS = 'lens/interesting';

  async function walkToTheCollision() {
    mountStack({ activeUid: LENS, activeHtml: fragment(LENS, { hash: null }) });
    await settle();

    // 2. open a card from the lens
    const card = document.createElement('a');
    card.dataset.pushCard = CARD_A;
    document.querySelector(`[data-uid="${LENS}"] .stack-card-body-inner`)!.appendChild(card);
    card.click();
    await settle();

    // 3. follow a tag link — a second, filtered view of the same lens
    const tag = document.createElement('a');
    tag.setAttribute('href', 'tag:what:puzzles');
    document.querySelector(`[data-uid="${CARD_A}"] .stack-card-body-inner`)!.appendChild(tag);
    tag.click();
    await settle();

    const filtered = get(stackStore).entries[2];
    expect(filtered.key).not.toBe(LENS);
    expect(filtered.slot).toBe('lens/interesting#2');

    // 4. clear the filter on it — the lens reports its (now empty) selection
    document.dispatchEvent(new CustomEvent('cardparam', { detail: { uid: LENS, params: [] } }));
    await settle();
  }

  it('keeps both lens entries when clearing a filter collides with the one behind', async () => {
    await walkToTheCollision();

    const state = get(stackStore);
    expect(state.entries.map(e => e.key)).toEqual([LENS, CARD_A, LENS]);
    // Same identity, two addresses — which is what lets them coexist.
    expect(state.entries.map(e => e.slot)).toEqual([LENS, CARD_A, 'lens/interesting#2']);
  });

  it('leaves the visitor on the lens they were editing, not the one behind it', async () => {
    await walkToTheCollision();

    const state = get(stackStore);
    expect(state.activeSlot).toBe('lens/interesting#2');
    // Addressing by key would resolve this to entry 0 — two entries back,
    // with the card in between visibly becoming a "forward" card.
    expect(state.entries.indexOf(activeEntry(state)!)).toBe(2);
  });

  it('renders exactly one active card, and it is the second lens', async () => {
    await walkToTheCollision();

    const active = document.querySelectorAll('.stack-card--active');
    expect(active).toHaveLength(1);
    expect((active[0] as HTMLElement).dataset.uid).toBe('lens/interesting#2');
    // Both lens fragments are still mounted; neither was destroyed by the
    // collision, and the card between them is still collapsed in place.
    expect(document.querySelectorAll('[data-uid^="lens/"]')).toHaveLength(2);
    expect(document.querySelector(`[data-uid="${CARD_A}"]`)!.classList.contains('stack-card--collapsed')).toBe(true);
  });

  it('round-trips the repeated location through the URL', async () => {
    await walkToTheCollision();

    // The cleared filter left the address bar, and the two entries behind the
    // active one are still both in it.
    expect(window.location.pathname).toBe('/lens/interesting');
    expect(window.location.search).not.toContain('filter.');

    const decoded = deserialiseStack(
      window.location.pathname,
      window.location.search,
      manifestLookup,
      tagManifestLookup,
    );
    expect(decoded.state.entries.map(e => e.key)).toEqual([LENS, CARD_A, LENS]);
    // Distinct handles on the way back in, so nothing deduplicates.
    expect(new Set(decoded.state.entries.map(e => e.slot)).size).toBe(3);
    expect(decoded.state.activeSlot).toBe(decoded.state.entries[2].slot);
  });
});

describe('back/forward keeps a location its own params (#103)', () => {
  // `from`/`to` are the codec's structural keys — they say where a location
  // sits in the stack, never what it is. The stack used to read the whole
  // query string as the location's own params on the two paths that rebuild
  // from a URL (the mount seed and `onPopstate`), so returning to a location
  // adopted its own stack context as side state. It was then re-emitted on
  // every later serialisation, beside the structural pair computed from the
  // live stack.
  const CARD_C = 'what/puzzles/cityscrapers';

  /** Every `?a=b` pair in the current URL, as an array so repeats are visible. */
  function searchPairs(): [string, string][] {
    const out: [string, string][] = [];
    new URLSearchParams(window.location.search).forEach((v, k) => out.push([k, v]));
    return out;
  }

  function pushFrom(hostSlot: string, uid: string) {
    const link = document.createElement('a');
    link.dataset.pushCard = uid;
    document.querySelector(`[data-uid="${hostSlot}"] .stack-card-body-inner`)!.appendChild(link);
    link.click();
  }

  it('returns to the exact URL the push wrote, and re-serialises it unchanged', async () => {
    history.replaceState(null, '', `/card/${CARD_A}`);
    mountStack({ activeUid: CARD_A, activeHtml: fragment(CARD_A) });
    await settle();

    pushFrom(CARD_A, CARD_B);
    await settle();
    const pushed = window.location.href;
    expect(window.location.search).toMatch(/(^|[?&])from=/);

    history.back();
    await settle();
    expect(window.location.pathname).toBe(`/card/${CARD_A}`);
    expect(get(stackStore).entries.map(e => e.key)).toEqual([CARD_A]);

    history.forward();
    await settle();
    expect(window.location.href).toBe(pushed);
    expect(get(stackStore).entries.map(e => e.key)).toEqual([CARD_A, CARD_B]);
    expect(get(stackStore).activeSlot).toBe(CARD_B);

    // The re-serialisation is where the loss used to surface: activating the
    // card behind used to emit `?to=<B>~<encoded from=…>`, B wearing the
    // structural key it had picked up on the way back.
    document.querySelector<HTMLElement>(`[data-uid="${CARD_A}"] .card-header`)!.click();
    await settle();
    expect(searchPairs()).toEqual([['to', manifestLookup.codeForUid(CARD_B) ?? CARD_B]]);
  });

  it('does not adopt the structural keys on a cold load either', async () => {
    // The mount seed reads `window.location.search` the same way, so a
    // deep-linked `/card/…?from=…` was corrupt before the visitor touched
    // anything.
    const fromCode = manifestLookup.codeForUid(CARD_A)!;
    history.replaceState(null, '', `/card/${CARD_B}?from=${fromCode}`);
    mountStack({ activeUid: CARD_B, activeHtml: fragment(CARD_B) });
    await settle();
    expect(get(stackStore).entries.map(e => e.key)).toEqual([CARD_A, CARD_B]);

    document.querySelector<HTMLElement>(`[data-uid="${CARD_A}"] .card-header`)!.click();
    await settle();
    expect(searchPairs()).toEqual([['to', manifestLookup.codeForUid(CARD_B) ?? CARD_B]]);
  });

  it('carries a genuine side param back and forward, exactly once', async () => {
    history.replaceState(null, '', `/card/${CARD_A}`);
    mountStack({ activeUid: CARD_A, activeHtml: fragment(CARD_A) });
    await settle();
    pushFrom(CARD_A, CARD_B);
    await settle();

    // B reports side state of its own — the thing `from`/`to` must not be
    // confused with.
    document.dispatchEvent(new CustomEvent('cardparam', { detail: { uid: CARD_B, params: [['tab', 'bio']] } }));
    await settle();
    expect(searchPairs()).toContainEqual(['tab', 'bio']);

    pushFrom(CARD_B, CARD_C);
    await settle();
    history.back();
    await settle();

    expect(get(stackStore).activeSlot).toBe(CARD_B);
    // Present, and present once.
    expect(searchPairs().filter(([k]) => k === 'tab')).toEqual([['tab', 'bio']]);
    expect(searchPairs().filter(([k]) => k === 'from')).toHaveLength(1);
  });

  it('keeps a filtered lens filtered across back/forward without duplicating its context', async () => {
    // The lens half of the ticket: its filters are its identity now (#100), so
    // they ride in the path's query rather than the side map — but the `from`
    // beside them is still the stack's, not the lens's.
    history.replaceState(null, '', `/card/${CARD_A}`);
    mountStack({ activeUid: CARD_A, activeHtml: fragment(CARD_A) });
    await settle();

    const tag = document.createElement('a');
    tag.setAttribute('href', 'tag:what:puzzles');
    document.querySelector(`[data-uid="${CARD_A}"] .stack-card-body-inner`)!.appendChild(tag);
    tag.click();
    await settle();
    const lensUrl = window.location.href;
    const lensKey = get(stackStore).entries[1].key;
    expect(lensKey).toContain('filter.what');

    pushFrom('lens/interesting', CARD_B);
    await settle();
    history.back();
    await settle();

    expect(window.location.href).toBe(lensUrl);
    expect(get(stackStore).entries.map(e => e.key)).toEqual([CARD_A, lensKey]);
    // Its identity survived, and the stack context beside it appears once.
    expect(searchPairs().filter(([k]) => k === 'filter.what')).toHaveLength(1);
    expect(searchPairs().filter(([k]) => k === 'from')).toHaveLength(1);

    // Re-activating the card behind it re-serialises the lens into `to=`; the
    // token used to carry a copy of the whole `from=` chain with it.
    document.querySelector<HTMLElement>(`[data-uid="${CARD_A}"] .card-header`)!.click();
    await settle();
    const to = new URLSearchParams(window.location.search).get('to')!;
    expect(to).not.toContain('.');
    const decoded = deserialiseStack(
      window.location.pathname,
      window.location.search,
      manifestLookup,
      tagManifestLookup,
    );
    expect(decoded.state.entries.map(e => e.key)).toEqual([CARD_A, lensKey]);
    expect(decoded.paramsByKey.size).toBe(0);
  });

  it('leaves a departed branch\'s side params behind on the way back', async () => {
    // The other half: a popstate throws the whole stack away and reads it back
    // from the URL, so the side map has to make the same round trip. Held over,
    // a param reported in a branch the visitor has left is re-attached the next
    // time a location with that key turns up.
    history.replaceState(null, '', `/card/${CARD_A}`);
    mountStack({ activeUid: CARD_A, activeHtml: fragment(CARD_A) });
    await settle();
    pushFrom(CARD_A, CARD_B);
    await settle();
    document.dispatchEvent(new CustomEvent('cardparam', { detail: { uid: CARD_B, params: [['tab', 'bio']] } }));
    await settle();
    expect(window.location.search).toContain('tab=bio');

    history.back();
    await settle();
    expect(get(stackStore).entries.map(e => e.key)).toEqual([CARD_A]);

    // Open B again from a plain link, which says nothing about tabs.
    pushFrom(CARD_A, CARD_B);
    await settle();

    expect(get(stackStore).activeSlot).toBe(CARD_B);
    expect(window.location.search).not.toContain('tab');
  });

  it('does not resurrect a location the visitor closed', async () => {
    // The sharpest consequence of the stale copy: a `to=` picked up as the
    // active location's own param outlives the entries it names, and the codec
    // emits nothing structural to overwrite it once they are gone.
    history.replaceState(null, '', `/card/${CARD_A}`);
    mountStack({ activeUid: CARD_A, activeHtml: fragment(CARD_A) });
    await settle();
    pushFrom(CARD_A, CARD_B);
    await settle();
    pushFrom(CARD_B, CARD_C);
    await settle();

    // Step back to A, so the URL now carries a `to=` naming B and C...
    document.querySelector<HTMLElement>(`[data-uid="${CARD_A}"] .card-header`)!.click();
    await settle();
    expect(window.location.search).toContain('to=');

    // ...go back onto that URL, then close everything ahead of A.
    history.back();
    await settle();
    history.forward();
    await settle();
    expect(get(stackStore).activeSlot).toBe(CARD_A);

    document.querySelector<HTMLElement>(`[data-uid="${CARD_B}"] .stack-card-close`)!.click();
    await settle();

    expect(get(stackStore).entries.map(e => e.key)).toEqual([CARD_A]);
    expect(window.location.search).toBe('');
  });
});

describe('the overflow pile (#111)', () => {
  /** Push `n` cards on top of the SSR-seeded one, so the stack runs deep
   *  enough for the behind fan to overflow its three slots. */
  async function stackOf(n: number) {
    mountStack({ activeUid: CARD_A, activeHtml: fragment(CARD_A, { title: 'Numbeanies' }) });
    await settle();
    for (let i = 0; i < n; i++) {
      const link = document.createElement('a');
      link.dataset.pushCard = `what/deep/card-${i}`;
      document.querySelector('.stack-card--active .stack-card-body-inner')!.appendChild(link);
      link.click();
      await settle();
    }
  }

  const pile = () => document.querySelector<HTMLElement>('.stack-pile');
  const bandText = () =>
    [...document.querySelectorAll('.stack-pile-band-text')].map(b => b.textContent);

  it('renders nothing while every card still holds a slot of its own', async () => {
    // Three behind, three slots: nothing is hidden, so there is nothing to
    // stand in for. A pile appearing here would be a marker, not a pile.
    await stackOf(3);
    expect(document.querySelectorAll('.stack-card')).toHaveLength(4);
    expect(pile()).toBeNull();
  });

  it('appears once the fan overflows, counting what it hides', async () => {
    // Six behind, three slots: two drawn, four in the pile.
    await stackOf(6);
    expect(pile()).not.toBeNull();
    expect(pile()!.dataset.side).toBe('behind');
    expect(pile()!.querySelector('.stack-pile-label')!.textContent).toBe('4 more');
    expect(bandText()).toHaveLength(4);
  });

  it('is drawn on the label card, never at a position of its own', async () => {
    await stackOf(6);
    // The geometry hands the overlay the label card's placement, so the two
    // must agree exactly — a pile drifting off the edge it labels is the whole
    // failure this avoids.
    // The label is the piled card painted LAST — the geometry's own rule, and
    // the reason the overlay lands where it does. Every piled card shares the
    // slot's `left`, so only `top` distinguishes them.
    const labelCard = [...document.querySelectorAll<HTMLElement>('.stack-card[data-piled]')]
      .reduce((a, b) =>
        Number(a.style.getPropertyValue('--geo-z')) > Number(b.style.getPropertyValue('--geo-z')) ? a : b);
    expect(pile()!.style.getPropertyValue('--geo-left'))
      .toBe(labelCard.style.getPropertyValue('--geo-left'));
    expect(pile()!.style.getPropertyValue('--geo-top'))
      .toBe(labelCard.style.getPropertyValue('--geo-top'));
  });

  it('runs its bands deepest-first, so the way back is up', async () => {
    await stackOf(6);
    // Behind, the pile hides the four oldest entries: the SSR card and the
    // first three pushes. Top to bottom they must read oldest -> nearest.
    expect(bandText()).toEqual([
      'Numbeanies',
      'what/deep/card-0',
      'what/deep/card-1',
      'what/deep/card-2',
    ]);
  });

  it('reaches a buried card in one click', async () => {
    await stackOf(6);
    // The top band is the oldest entry — six hops back, and the hops are not
    // even navigable, since the cards between it and the visitor are the ones
    // the pile is hiding.
    document.querySelectorAll<HTMLElement>('.stack-pile-band')[0].click();
    await settle();

    expect(get(stackStore).activeSlot).toBe(CARD_A);
    // Nothing was closed on the way: a jump is a re-activation, not a trim.
    expect(get(stackStore).entries).toHaveLength(7);
  });

  it('keeps one overlay per side across an active change', async () => {
    await stackOf(6);
    const before = pile()!;
    // Re-activating a drawn behind card keeps the pile on the behind side, so
    // the SAME node must travel rather than be rebuilt — keying the overlay on
    // its label slot instead of its side would remount it on every push, which
    // is the identity trap the cards themselves have (#99 trap 4).
    document.querySelector<HTMLElement>('.stack-card[data-role="behind"]:not([data-piled]) .card-header')!.click();
    await settle();
    expect(pile()).toBe(before);
    expect(document.querySelectorAll('.stack-pile')).toHaveLength(1);
  });
});
