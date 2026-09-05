import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { getContainerRenderer } from '@astrojs/svelte';
import svelteServerRenderer from '@astrojs/svelte/server.js';
import LensStackCard from './LensStackCard.astro';
import { DEFAULT_BROWSE_LENS_ID } from '../lib/lens-registry';
import { siteSubtitle } from '../lib/lens-chrome';

async function makeContainer() {
  const renderers = [{ ...getContainerRenderer(), ssr: svelteServerRenderer }];
  return AstroContainer.create({ renderers });
}

function dom(html: string) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

describe('LensStackCard', () => {
  it('renders the home lens with the "lens/home" data-uid', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(LensStackCard, { props: { name: 'home' } });
    const div = dom(html);

    expect(div.querySelector('.stack-card')?.getAttribute('data-uid')).toBe('lens/home');
  });

  it('renders the newest lens with the "lens/newest" data-uid and derived card title', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(LensStackCard, { props: { name: 'newest' } });
    const div = dom(html);

    expect(div.querySelector('.stack-card')?.getAttribute('data-uid')).toBe('lens/newest');
    expect(div.querySelector('.card-header-title')?.textContent).toContain('Newest');
  });

  it("home's card-mode title is the site title, not the lens label", async () => {
    const container = await makeContainer();
    const html = await container.renderToString(LensStackCard, { props: { name: 'home' } });
    const div = dom(html);

    expect(div.querySelector('.card-header-title')?.textContent).toContain('pdyxs.wtf');
  });

  it('page presentation adds the stack-card--page class and page-mode chrome', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(LensStackCard, {
      props: { name: 'home', presentation: 'page' },
    });
    const div = dom(html);

    const card = div.querySelector('.stack-card')!;
    expect(card.classList.contains('stack-card--page')).toBe(true);
    expect(div.querySelector('.page-title')?.textContent).toContain('pdyxs.wtf');
    // The SITE's subtitle, not the lens's label (which is what it used to be).
    expect(div.querySelector('.page-subtitle')?.textContent).toBe(siteSubtitle());
  });

  it('card presentation (default) does not carry the page class', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(LensStackCard, { props: { name: 'home' } });
    const div = dom(html);

    expect(div.querySelector('.stack-card')?.classList.contains('stack-card--page')).toBe(false);
  });

  it('home is not closable (no close button)', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(LensStackCard, { props: { name: 'home' } });
    const div = dom(html);

    expect(div.querySelector('.stack-card-close')).toBeNull();
  });

  it('a non-home lens is closable in card mode', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(LensStackCard, { props: { name: 'newest' } });
    const div = dom(html);

    expect(div.querySelector('.stack-card-close')).not.toBeNull();
  });

  it('renders the lens body inside an open body-wrapper', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(LensStackCard, { props: { name: 'home' } });
    const div = dom(html);

    expect(div.querySelector('.body-wrapper.open .stack-card-body-inner')).not.toBeNull();
  });

  it('carries the registry-declared width as a data-width attribute', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(LensStackCard, { props: { name: 'newest' } });
    const div = dom(html);

    expect(div.querySelector('.stack-card')?.getAttribute('data-width')).toBe('960px');
  });

  // Home used to be the lens with no declared width, which is what this
  // asserted; since #132 it declares the site's widest (1100px), and every
  // lens on the site now declares one. `width` is still optional on a
  // LensDefinition — Astro simply omits the attribute for `undefined` — so
  // what is left to assert is that the declared value reaches the fragment,
  // which is what CardStack's applyMaxWidth reads back.
  it('carries the lens\'s declared width through as data-width', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(LensStackCard, { props: { name: 'home' } });
    const div = dom(html);

    expect(div.querySelector('.stack-card')?.getAttribute('data-width')).toBe('1100px');
  });

  it('falls back to a not-found message for an unregistered lens name', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(LensStackCard, { props: { name: 'does-not-exist' } });
    const div = dom(html);

    expect(div.querySelector('.lens-not-found')?.textContent).toContain('does-not-exist');
  });

  it('renders the 5W dimension-filter bar for the home lens', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(LensStackCard, { props: { name: 'home' } });
    const div = dom(html);

    expect(div.querySelector('.fp-dimension-controls[role="toolbar"]')).not.toBeNull();
  });

  it('renders the 5W dimension-filter bar for the newest lens', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(LensStackCard, { props: { name: 'newest' } });
    const div = dom(html);

    expect(div.querySelector('.fp-dimension-controls[role="toolbar"]')).not.toBeNull();
  });

  // NO LENS FRAGMENT SERVER-RENDERS A RESULTS GRID ANY MORE (#140, implemented
  // for the browse family in #150). This used to assert the opposite — the full
  // unfiltered count in `.fp-result-count` — and the change is forced rather
  // than chosen: the body takes its cards from `/cards.json` on the client, and
  // Astro renders an island server-side *from its props*, so there is nothing
  // to render a grid from. What the server emits instead is the pending
  // skeleton, and it draws itself (`fp-skeleton--pending`) rather than waiting
  // for the `data-filters-pending` guard, which is set on neither an unfiltered
  // cold load nor a fragment.
  it('server-renders the pending skeleton, not a results grid', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(LensStackCard, { props: { name: 'newest' } });
    const div = dom(html);

    const skeleton = div.querySelector('.fp-skeleton');
    expect(skeleton).not.toBeNull();
    expect(skeleton!.classList.contains('fp-skeleton--pending')).toBe(true);
    // Newest is a strip lens, and the skeleton knows that from the config alone.
    expect(skeleton!.classList.contains('fp-skeleton--strip')).toBe(true);

    expect(div.querySelector('.fp-result-count')).toBeNull();
    expect(div.querySelector('.fp-browse-list')).toBeNull();
    // `null` is not `[]`: no "no cards match" over a request still in flight.
    expect(div.querySelector('.fp-browse-empty')).toBeNull();
  });

  it('renders the home lens body (day-seeded front-page slots)', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(LensStackCard, { props: { name: 'home' } });
    const div = dom(html);

    // The grid is rendered from home.lens.yaml alone (issue #133) — server-side
    // and unconditionally, with placeholder interiors until the pool arrives.
    expect(div.querySelector('.fp-slot-grid')).not.toBeNull();
    expect(div.querySelectorAll('.fp-slot').length).toBeGreaterThan(0);
  });

  // ── Spine + sentinel (issue #108) ────────────────────────────────────────
  //
  // Page mode and card mode are one DOM with a class toggled, so one spine
  // serves both — but each shape is asserted, since the spine is placed before
  // the page header and the sentinel before the card header.

  for (const presentation of ['page', 'card'] as const) {
    it(`renders the spine as the first child in ${presentation} mode`, async () => {
      const container = await makeContainer();
      const html = await container.renderToString(LensStackCard, {
        props: { name: 'newest', presentation },
      });
      const stack = dom(html).querySelector('.stack-card')!;

      expect(stack.firstElementChild?.classList.contains('stack-card-spine')).toBe(true);
      expect(stack.querySelector('.stack-card-spine > .stack-card-spine-inner')).not.toBeNull();

      const title = stack.querySelector('.stack-card-spine-inner > .stack-card-spine-title');
      expect(title?.textContent).toBe(
        stack.querySelector('.card-header-title')?.textContent ?? '',
      );
      expect(title?.textContent).toContain('Newest');
    });

    it(`renders the header sentinel immediately before the card header in ${presentation} mode`, async () => {
      const container = await makeContainer();
      const html = await container.renderToString(LensStackCard, {
        props: { name: 'newest', presentation },
      });
      const stack = dom(html).querySelector('.stack-card')!;
      const sentinel = stack.querySelector('.card-header-sentinel');

      expect(sentinel).not.toBeNull();
      expect(sentinel!.nextElementSibling?.classList.contains('card-header')).toBe(true);
    });
  }

  it("home's filter-toggle fallthrough trigger targets the default browse lens", async () => {
    const container = await makeContainer();
    const html = await container.renderToString(LensStackCard, { props: { name: 'home' } });
    const div = dom(html);

    expect(div.querySelector(`[data-replace-slot="lens/${DEFAULT_BROWSE_LENS_ID}"]`)).not.toBeNull();
  });

  it('does not render active-filter chips on a cold load with no active filters', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(LensStackCard, { props: { name: 'newest' } });
    const div = dom(html);

    expect(div.querySelector('.fp-active-filters')).toBeNull();
  });
});
