// The suspended mark's server render, and the pre-paint decision it is drawn
// from (slice 6 of docs/plans/suspended-mark.md): a page that loads in card
// mode must show the dot hanging in its very first paint, before any module
// runs, and a page that loads in page mode must not.
import { describe, it, expect, afterEach } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { getContainerRenderer } from '@astrojs/svelte/container-renderer';
import svelteServerRenderer from '@astrojs/svelte/server.js';
import SuspendedMark from '@components/site/SuspendedMark.astro';
import Base from '../../layouts/Base.astro';
import IndexPage from '../../pages/index.astro';
import { MARK_RIG } from '@data/mark-rig';
import { HANG_DOT_INK, HANG_UNITS, hangMarkup } from '@site/mark/hang';
import { COLD_PRESENTATION_ATTR, coldPresentation } from '@site/presentation-event';
import { stackStore } from '@stores/card-stack-store';

function dom(html: string) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

async function render(component: Parameters<AstroContainer['renderToString']>[0], props: Record<string, unknown> = {}) {
  const container = await AstroContainer.create({ renderers: [{ ...getContainerRenderer(), ssr: svelteServerRenderer }] });
  return container.renderToString(component, { props });
}

describe('the overlay as the server draws it', () => {
  it('carries the hanging pose: the threads and the dot, in em units about the dot', async () => {
    const div = dom(await render(SuspendedMark));
    const hang = div.querySelector('site-mark > svg.site-mark-hang')!;
    expect(hang).not.toBeNull();
    const mk = hangMarkup(MARK_RIG);
    expect(hang.getAttribute('viewBox')).toBe(`${mk.box.x} ${mk.box.y} ${mk.box.width} ${mk.box.height}`);
    const paths = [...hang.querySelectorAll('.site-mark-threads path')].map((p) => p.getAttribute('d'));
    expect(paths).toEqual(mk.paths);
    expect(paths).toHaveLength(MARK_RIG.threads.length);
    const dot = hang.querySelector('rect.site-mark-dot')!;
    const size = Number(dot.getAttribute('width'));
    expect(size).toBeCloseTo(HANG_DOT_INK * HANG_UNITS, 1);
    expect(Number(dot.getAttribute('height'))).toBe(size);
    // Centred on the viewBox's origin, which CSS puts at the top-centre.
    expect(Number(dot.getAttribute('x')) + size / 2).toBeCloseTo(0, 1);
    expect(Number(dot.getAttribute('y')) + size / 2).toBeCloseTo(0, 1);
  });

  it('hands CSS the box in em, and the stroke the script draws', async () => {
    const div = dom(await render(SuspendedMark));
    const style = div.querySelector('.site-mark-hang')!.getAttribute('style')!;
    const mk = hangMarkup(MARK_RIG);
    expect(style).toContain(`--hang-x: ${mk.box.x / HANG_UNITS}`);
    expect(style).toContain(`--hang-w: ${mk.box.width / HANG_UNITS}`);
    expect(style).toContain(`--hang-stroke-em: ${MARK_RIG.width}`);
    expect(style).toContain('--hang-stroke-min: 1.2px');
  });

  it('keeps the live overlay empty until the script draws it, and a probe for the hang tokens', async () => {
    const div = dom(await render(SuspendedMark));
    const live = div.querySelector('.site-mark-overlay')!;
    expect(live.querySelectorAll('.site-mark-threads path')).toHaveLength(MARK_RIG.threads.length);
    for (const p of live.querySelectorAll('path')) expect(p.hasAttribute('d')).toBe(false);
    expect(live.querySelector('.site-mark-dot')!.hasAttribute('width')).toBe(false);
    expect(div.querySelector('.site-mark-hang-probe')).not.toBeNull();
  });
});

describe('html[data-cold-presentation]: page or card, before paint', () => {
  afterEach(() => {
    document.documentElement.removeAttribute(COLD_PRESENTATION_ATTR);
    history.replaceState(null, '', '/');
  });

  /** Base's head script that counts the fan, as the browser would run it, at `url`. */
  function runPrePaint(html: string, url: string) {
    const div = dom(html);
    const seed = html.match(/<html[^>]*data-cold-presentation="(page|card)"/)?.[1] ?? null;
    if (seed) document.documentElement.setAttribute(COLD_PRESENTATION_ATTR, seed);
    history.replaceState(null, '', url);
    const script = [...div.querySelectorAll('script')].find((s) => s.textContent?.includes('coldPresentation'));
    expect(script, 'the pre-paint script').toBeTruthy();
    new Function(script!.textContent!)();
    return coldPresentation();
  }

  it('is seeded by the route: page mode for a lens page, card for everything else', async () => {
    stackStore.set({ entries: [], activeSlot: null });
    expect(await render(IndexPage)).toMatch(/<html[^>]*data-cold-presentation="page"/);
    expect(await render(Base)).toMatch(/<html[^>]*data-cold-presentation="card"/);
  });

  it('stays page mode for a lens with no fan', async () => {
    expect(runPrePaint(await render(Base, { presentation: 'page' }), '/')).toBe('page');
    expect(runPrePaint(await render(Base, { presentation: 'page' }), '/lens/newest?filter.what=art')).toBe('page');
  });

  it('turns card mode when the URL carries from/to entries, which the stack will restore above it', async () => {
    expect(runPrePaint(await render(Base, { presentation: 'page' }), '/lens/newest?from=0')).toBe('card');
    expect(runPrePaint(await render(Base, { presentation: 'page' }), '/lens/newest?to=0')).toBe('card');
  });

  it('leaves a card, and a page with no stack, in card mode', async () => {
    expect(runPrePaint(await render(Base), '/card/what/art/art-heist')).toBe('card');
    expect(runPrePaint(await render(Base), '/card/what/art/art-heist?from=0')).toBe('card');
  });

  it('reads as nothing on a page that says neither', () => {
    expect(coldPresentation()).toBeNull();
    document.documentElement.setAttribute(COLD_PRESENTATION_ATTR, 'sideways');
    expect(coldPresentation()).toBeNull();
  });

  it("doesn't mount the mark where a page asks for none", async () => {
    expect(dom(await render(Base, { mark: false })).querySelector('site-mark')).toBeNull();
    expect(dom(await render(Base)).querySelector('site-mark')).not.toBeNull();
  });
});
