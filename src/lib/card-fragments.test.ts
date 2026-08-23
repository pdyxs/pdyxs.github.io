// The fragment layer, exercised against a fake fragment source (issue #97).
//
// The network is the injected seam (`load`), so every stack flow's *fragment
// side* — which locations get fetched, how often, and what is rendered while a
// fetch is in flight — is assertable here without a browser and without
// mounting the island (which is impossible in this project; see CLAUDE.md and
// CardStack.cold-load.test.ts).
//
// What is NOT covered here is the stack side of those flows: which entries end
// up in the store, and in what order. That lives in CardStack.svelte by
// invariant ("CardStack.svelte owns all card-stack mutations") and in
// card-stack-store.test.ts, and the wiring between the two is guarded in
// CardStack.fragments.test.ts.
import { describe, it, expect, vi } from 'vitest';
import {
  buildPlaceholderHtml,
  createCardFragments,
  escapeHtml,
  extractBodyInner,
  extractStackCard,
  titleOfElement,
  uidToFetchUrl,
  urlToUid,
  withSlotUid,
} from './card-fragments';

/** A rendered `.stack-card`, as the server would produce one. */
function fragment(uid: string, opts: { title?: string; body?: string; width?: string; hash?: string } = {}) {
  const width = opts.width ? ` data-width="${opts.width}"` : '';
  const hash = opts.hash ? ` data-content-hash="${opts.hash}"` : '';
  const title = opts.title ?? uid;
  // Spine included, because all three real shells render one (issue #109) and
  // `replaceBody` now copies its title across.
  return `<div class="stack-card" data-uid="${uid}"${width}${hash}>` +
    `<div class="stack-card-spine"><div class="stack-card-spine-inner">` +
    `<span class="stack-card-spine-title">${title}</span></div></div>` +
    `<div class="card-header"><span class="card-header-title">${title}</span></div>` +
    `<div class="body-wrapper"><div class="stack-card-body"><div class="stack-card-body-inner">` +
    `${opts.body ?? '<p>body</p>'}` +
    `</div></div></div></div>`;
}

/** A fake fragment source: resolves the fragments it knows, null for the rest. */
function fakeSource(known: Record<string, string>) {
  return vi.fn(async (uid: string) => known[uid] ?? null);
}

describe('uid ↔ URL', () => {
  it('routes a lens to its lean fragment and a card to its own page', () => {
    expect(uidToFetchUrl('lens/newest')).toBe('/fragment/lens/newest');
    expect(uidToFetchUrl('what/puzzles/fog')).toBe('/card/what/puzzles/fog');
  });

  it('round-trips both fragment URLs and browsable lens URLs', () => {
    expect(urlToUid('/fragment/lens/newest')).toBe('lens/newest');
    expect(urlToUid('/lens/newest')).toBe('lens/newest');
    expect(urlToUid('/card/what/puzzles/fog')).toBe('what/puzzles/fog');
    expect(urlToUid(uidToFetchUrl('lens/home'))).toBe('lens/home');
    expect(urlToUid(uidToFetchUrl('posts/thing'))).toBe('posts/thing');
  });

  it('leaves an already-bare uid alone', () => {
    expect(urlToUid('posts')).toBe('posts');
  });
});

describe('reading facts out of a fragment', () => {
  it('extracts the sole .stack-card from a whole rendered document', () => {
    const html = `<html><body><div id="x"></div>${fragment('a/b')}</body></html>`;
    expect(extractStackCard(html)).toBe(fragment('a/b'));
  });

  it('returns null when the response carried no .stack-card', () => {
    // A 404 page, or a route that stopped rendering one — the caller must not
    // stack the location rather than stacking an empty one.
    expect(extractStackCard('<html><body><h1>Not found</h1></body></html>')).toBeNull();
  });

  it('reads the body inner HTML, and null when there is none', () => {
    expect(extractBodyInner(fragment('a/b', { body: '<p>hi</p>' }))).toBe('<p>hi</p>');
    expect(extractBodyInner('<div class="stack-card"></div>')).toBeNull();
  });

  it('reads a title off any element that offers one', () => {
    const div = document.createElement('div');
    div.innerHTML = '<a class="card-link"><span class="card-header-title"> Fog  </span></a>';
    expect(titleOfElement(div.querySelector('.card-link'))).toBe('Fog');
    expect(titleOfElement(null)).toBeNull();
  });
});

describe('the placeholder fragment', () => {
  it('carries the uid and title, and an empty body for replaceBody to fill', () => {
    const html = buildPlaceholderHtml('what/x', 'A Title');
    const el = document.createElement('div');
    el.innerHTML = html;
    const card = el.querySelector('.stack-card')!;
    expect(card.getAttribute('data-uid')).toBe('what/x');
    expect(card.querySelector('.card-header-title')?.textContent?.trim()).toBe('A Title');
    // The stable selector contract, which the layout $effect and the
    // expand/collapse CSS both depend on.
    expect(card.querySelector('.body-wrapper .stack-card-body .stack-card-body-inner')).not.toBeNull();
    expect(extractBodyInner(html)).toBe('');
    // The spine too: `replaceBody` swaps only the body, so whatever shell a
    // placeholder mounts with is the shell that location keeps — and without a
    // spine a collapsed card occludes nothing (issue #109).
    expect(card.querySelector('.stack-card-spine .stack-card-spine-inner .stack-card-spine-title')?.textContent)
      .toBe('A Title');
  });

  it('escapes a title so a quote or bracket cannot break out of the markup', () => {
    expect(escapeHtml('a "b" <c> & d')).toBe('a &quot;b&quot; &lt;c&gt; &amp; d');
    const html = buildPlaceholderHtml('u', '<script>x</script>');
    expect(html).not.toContain('<script>');
  });

  it('declares no width — a placeholder must not claim the real one', () => {
    const fragments = createCardFragments();
    fragments.seedPlaceholder('what/x', 'A Title');
    expect(fragments.factsFor('what/x').width).toBeUndefined();
  });
});

describe('the fragment store', () => {
  it('serves a seeded fragment without touching the network (SSR cold load)', async () => {
    const load = fakeSource({});
    const fragments = createCardFragments({ load });
    fragments.seed('what/a', fragment('what/a'));
    expect(fragments.has('what/a')).toBe(true);
    expect(await fragments.ensure('what/a')).toBe(true);
    expect(load).not.toHaveBeenCalled();
  });

  it('fetches an unknown location once and caches it', async () => {
    const load = fakeSource({ 'what/a': fragment('what/a') });
    const fragments = createCardFragments({ load });

    expect(await fragments.ensure('what/a')).toBe(true);
    expect(await fragments.ensure('what/a')).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    expect(fragments.get('what/a')).toBe(fragment('what/a'));
  });

  it('reports failure and caches nothing when the source has no fragment', async () => {
    const load = fakeSource({});
    const fragments = createCardFragments({ load });

    expect(await fragments.ensure('what/missing')).toBe(false);
    expect(fragments.has('what/missing')).toBe(false);
    expect(fragments.get('what/missing')).toBeUndefined();
  });

  it('load() fetches without caching, for a request started before the decision', async () => {
    // pushCard starts the network request before it knows whether it will show
    // a placeholder, so the result must not land in the cache behind its back.
    const load = fakeSource({ 'what/a': fragment('what/a') });
    const fragments = createCardFragments({ load });

    expect(await fragments.load('what/a')).toBe(fragment('what/a'));
    expect(fragments.has('what/a')).toBe(false);
  });

  it('reads title and width out of the cached fragment', async () => {
    const fragments = createCardFragments({
      load: fakeSource({ 'what/a': fragment('what/a', { title: ' Fog ', width: '520px' }) }),
    });
    await fragments.ensure('what/a');

    expect(fragments.factsFor('what/a')).toEqual({ title: 'Fog', width: '520px' });
  });

  it('reports nothing for a location it holds no fragment for', () => {
    expect(createCardFragments().factsFor('nope')).toEqual({ title: null, width: undefined });
  });

  it('announces every write, so no caller has to know the cache is not reactive', async () => {
    const changed: string[] = [];
    const fragments = createCardFragments({
      load: fakeSource({ 'what/a': fragment('what/a') }),
      onChange: (key) => changed.push(key),
    });

    fragments.seed('what/seeded', fragment('what/seeded'));
    fragments.seedPlaceholder('what/p', 'P');
    await fragments.ensure('what/a');
    await fragments.ensure('what/a'); // cache hit — nothing changed
    await fragments.ensure('what/missing'); // failed — nothing changed

    expect(changed).toEqual(['what/seeded', 'what/p', 'what/a']);
  });
});

describe('replaceBody (the placeholder → real content swap)', () => {
  function mountedPlaceholder(uid: string, title: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = buildPlaceholderHtml(uid, title);
    return host.querySelector<HTMLElement>('.stack-card')!;
  }

  it('writes the real body into the mounted card and keeps its header', () => {
    const fragments = createCardFragments();
    fragments.seedPlaceholder('what/a', 'Fog');
    const card = mountedPlaceholder('what/a', 'Fog');

    fragments.replaceBody('what/a', fragment('what/a', { title: 'Fog', body: '<p>real</p>' }), card);

    expect(card.querySelector('.stack-card-body-inner')?.innerHTML).toBe('<p>real</p>');
    // The header element is the one the view transition is morphing into —
    // replacing the whole card would pull it out from under the animation.
    expect(card.querySelector('.card-header-title')?.textContent?.trim()).toBe('Fog');
  });

  it('copies the real titles onto the kept header and spine (#105)', () => {
    // The placeholder's shell is permanent — only the body is swapped — so a
    // title guessed at seed time is the title that location shows for the rest
    // of the session unless this copies over it. That reaches the header, the
    // spine, and any pile band that later names the card from this markup.
    const fragments = createCardFragments();
    fragments.seedPlaceholder('what/a', 'Guessed');
    const card = mountedPlaceholder('what/a', 'Guessed');

    fragments.replaceBody('what/a', fragment('what/a', { title: 'Fog' }), card);

    expect(card.querySelector('.card-header-title')?.textContent?.trim()).toBe('Fog');
    expect(card.querySelector('.stack-card-spine-title')?.textContent?.trim()).toBe('Fog');
  });

  it('keeps the header ELEMENT while replacing its text', () => {
    // Not a detail: the sticky-header observer (#110) captures `.card-header`
    // by reference and toggles `card-header--stuck` on it. Swap the node and
    // the observer spends the session toggling a detached element.
    const fragments = createCardFragments();
    fragments.seedPlaceholder('what/a', 'Guessed');
    const card = mountedPlaceholder('what/a', 'Guessed');
    const header = card.querySelector('.card-header');
    const spine = card.querySelector('.stack-card-spine-title');

    fragments.replaceBody('what/a', fragment('what/a', { title: 'Fog' }), card);

    expect(card.querySelector('.card-header')).toBe(header);
    expect(card.querySelector('.stack-card-spine-title')).toBe(spine);
  });

  it('survives a card that has no spine to copy into', () => {
    // `replaceBody` is also reachable for a location seeded from real markup,
    // and a fragment shape is not something this should assume.
    const fragments = createCardFragments();
    const host = document.createElement('div');
    host.innerHTML = '<div class="stack-card" data-uid="what/a">' +
      '<div class="body-wrapper"><div class="stack-card-body">' +
      '<div class="stack-card-body-inner"></div></div></div></div>';
    const card = host.querySelector<HTMLElement>('.stack-card')!;

    expect(() => fragments.replaceBody('what/a', fragment('what/a', { title: 'Fog' }), card)).not.toThrow();
    expect(card.querySelector('.stack-card-body-inner')?.innerHTML).toBe('<p>body</p>');
  });

  it('caches the real fragment, so the next navigation skips the network', async () => {
    const load = fakeSource({ 'what/a': fragment('what/a', { width: '520px' }) });
    const fragments = createCardFragments({ load });
    fragments.seedPlaceholder('what/a', 'Fog');
    const real = (await fragments.load('what/a'))!;

    fragments.replaceBody('what/a', real, mountedPlaceholder('what/a', 'Fog'));

    expect(fragments.get('what/a')).toBe(real);
    // The real fragment's declared width is only knowable now — the layout
    // effect ran against the widthless placeholder.
    expect(fragments.factsFor('what/a').width).toBe('520px');
    expect(await fragments.ensure('what/a')).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('announces the swap so the active location reapplies its width', () => {
    const changed: string[] = [];
    const fragments = createCardFragments({ onChange: (k) => changed.push(k) });
    fragments.seedPlaceholder('what/a', 'Fog');
    changed.length = 0;

    fragments.replaceBody('what/a', fragment('what/a', { width: '520px' }), mountedPlaceholder('what/a', 'Fog'));

    expect(changed).toEqual(['what/a']);
  });

  it('still caches when the card is gone from the DOM, and does not throw', () => {
    const fragments = createCardFragments();
    const html = fragment('what/a');
    expect(() => fragments.replaceBody('what/a', html, null)).not.toThrow();
    expect(fragments.get('what/a')).toBe(html);
  });
});

// The stack flows, from the fragment layer's side. Each one is named for the
// orchestration step in CardStack.svelte that drives it; CardStack.fragments.
// test.ts asserts that step calls what is exercised here.
describe('stack flows against a fake fragment source', () => {
  const HOME = 'lens/home';

  it('push: an uncached card is fetched once, then rendered from cache', async () => {
    const load = fakeSource({ 'what/a': fragment('what/a'), 'what/b': fragment('what/b') });
    const fragments = createCardFragments({ load });

    await fragments.ensure('what/a');
    await fragments.ensure('what/b');
    expect(load.mock.calls.map(c => c[0])).toEqual(['what/a', 'what/b']);
    expect(fragments.get('what/b')).toContain('data-uid="what/b"');
  });

  it('push with a view transition: placeholder renders first, real content lands after', async () => {
    const load = fakeSource({ 'what/a': fragment('what/a', { body: '<p>real</p>', width: '520px' }) });
    const fragments = createCardFragments({ load });

    // The request starts before the transition, and the placeholder is what
    // the stack renders while it is in flight.
    const inFlight = fragments.load('what/a');
    fragments.seedPlaceholder('what/a', 'Fog');
    expect(extractBodyInner(fragments.get('what/a')!)).toBe('');

    const host = document.createElement('div');
    host.innerHTML = fragments.get('what/a')!;
    fragments.replaceBody('what/a', (await inFlight)!, host.querySelector('.stack-card'));

    expect(host.querySelector('.stack-card-body-inner')?.innerHTML).toBe('<p>real</p>');
    expect(fragments.factsFor('what/a').width).toBe('520px');
  });

  it('re-activate: a location already in the stack costs no request', async () => {
    const load = fakeSource({ 'what/a': fragment('what/a') });
    const fragments = createCardFragments({ load });
    await fragments.ensure('what/a');
    load.mockClear();

    // Activating an entry the stack already holds only reads the cache — for
    // its title in the overflow panel, and its hash for read tracking.
    expect(fragments.factsFor('what/a').title).toBe('what/a');
    expect(fragments.get('what/a')).toContain('data-uid="what/a"');
    expect(load).not.toHaveBeenCalled();
  });

  it('close to empty: home is fetched once, and reused on every later close', async () => {
    const load = fakeSource({ [HOME]: fragment(HOME), 'what/a': fragment('what/a') });
    const fragments = createCardFragments({ load });
    fragments.seed('what/a', fragment('what/a')); // the deep-linked card

    expect(await fragments.ensure(HOME)).toBe(true);
    expect(await fragments.ensure(HOME)).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('close to empty: a home fetch that fails reports false (the full-reload fallback)', async () => {
    const fragments = createCardFragments({ load: fakeSource({}) });
    expect(await fragments.ensure(HOME)).toBe(false);
  });

  it('popstate: the path is mapped to a uid and ensured, for both cards and lenses', async () => {
    const load = fakeSource({ 'what/a': fragment('what/a'), 'lens/newest': fragment('lens/newest') });
    const fragments = createCardFragments({ load });

    expect(await fragments.ensure(urlToUid('/card/what/a'))).toBe(true);
    expect(await fragments.ensure(urlToUid('/lens/newest'))).toBe(true);
    expect(load.mock.calls.map(c => c[0])).toEqual(['what/a', 'lens/newest']);
  });

  it('popstate: going back to a location visited earlier is served from cache', async () => {
    const load = fakeSource({ 'what/a': fragment('what/a') });
    const fragments = createCardFragments({ load });
    await fragments.ensure('what/a');
    load.mockClear();

    expect(await fragments.ensure(urlToUid('/card/what/a'))).toBe(true);
    expect(load).not.toHaveBeenCalled();
  });

  it('popstate: a location whose page no longer exists is not stacked', async () => {
    const fragments = createCardFragments({ load: fakeSource({}) });
    expect(await fragments.ensure(urlToUid('/card/what/gone'))).toBe(false);
  });
});


describe('the cache stores every fragment under its own handle (issue #100)', () => {
  it('withSlotUid rewrites the root data-uid, and is a no-op when it already matches', () => {
    const html = fragment('lens/newest');
    expect(withSlotUid(html, 'lens/newest')).toBe(html);
    expect(withSlotUid(html, 'lens/newest#2')).toContain('data-uid="lens/newest#2"');
  });

  it('two views of one lens are fetched from one url but cached under two handles', async () => {
    // Left with the server's uid, both fragments would answer
    // [data-uid="lens/newest"] and every querySelector in CardStack would find
    // whichever mounted first.
    const load = fakeSource({ 'lens/newest': fragment('lens/newest') });
    const fragments = createCardFragments({ load });

    expect(await fragments.ensure('lens/newest', 'lens/newest')).toBe(true);
    expect(await fragments.ensure('lens/newest#2', 'lens/newest')).toBe(true);

    expect(load.mock.calls.map(c => c[0])).toEqual(['lens/newest', 'lens/newest']);
    expect(fragments.get('lens/newest')).toContain('data-uid="lens/newest"');
    expect(fragments.get('lens/newest#2')).toContain('data-uid="lens/newest#2"');
  });

  it('a placeholder is built at its handle too', () => {
    const fragments = createCardFragments({ load: fakeSource({}) });
    fragments.seedPlaceholder('lens/newest#2', 'Most Interesting');
    expect(fragments.get('lens/newest#2')).toContain('data-uid="lens/newest#2"');
  });
});
