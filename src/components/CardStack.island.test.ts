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
import { mount, unmount, tick } from 'svelte';
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

/** Mount the island the way `StackNav.astro` does, into a fresh document body. */
function mountStack(props: { activeUid?: string; activeHtml?: string | null } = {}) {
  target = document.createElement('div');
  document.body.appendChild(target);
  component = mount(CardStack as any, { target, props }) as Record<string, unknown>;
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
