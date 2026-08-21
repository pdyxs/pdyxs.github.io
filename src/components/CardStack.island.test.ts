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
});

describe('the layout effect applies the store to the DOM', () => {
  it('marks exactly one card active and the rest collapsed', async () => {
    mountStack({ activeUid: CARD_A, activeHtml: fragment(CARD_A) });
    await settle();
    const link = document.createElement('a');
    link.dataset.pushCard = CARD_B;
    document.querySelector('.stack-card-body-inner')!.appendChild(link);
    link.click();
    await settle();

    const active = document.querySelectorAll('.stack-card--active');
    expect(active).toHaveLength(1);
    expect((active[0] as HTMLElement).dataset.uid).toBe(CARD_B);
    expect(document.querySelector(`[data-uid="${CARD_A}"]`)!.classList.contains('stack-card--collapsed')).toBe(true);
    // The body-wrapper `open` class is effect-owned, not markup-owned.
    expect(document.querySelector(`[data-uid="${CARD_B}"] .body-wrapper`)!.classList.contains('open')).toBe(true);
    expect(document.querySelector(`[data-uid="${CARD_A}"] .body-wrapper`)!.classList.contains('open')).toBe(false);
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
