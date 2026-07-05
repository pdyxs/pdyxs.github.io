import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { getContainerRenderer } from '@astrojs/svelte';
import svelteServerRenderer from '@astrojs/svelte/server.js';
import IndexPage from '../pages/index.astro';
import LensNamePage from '../pages/lens/[name].astro';
import { stackStore } from '../stores/card-stack-store';

async function makeContainer() {
  const renderers = [{ ...getContainerRenderer(), ssr: svelteServerRenderer }];
  return AstroContainer.create({ renderers });
}

// stackStore is a module-level singleton that CardStack.svelte seeds as a
// side effect of construction (both SSR and client mount) — see its
// "Seed store from SSR prop once at mount" comment. A real page load always
// starts from a fresh module instance, so every render below resets it first
// to reproduce that baseline; without this, two renderToString() calls in
// the same test process leak one render's committed activeKey into the
// next render's nested FilterBar output (rendered, via Astro.slots.render,
// before CardStack's own seeding runs).
function resetStackStore() {
  stackStore.set({ entries: [], activeKey: null });
}

function dom(html: string) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

describe('/ folds into the home lens', () => {
  it('/ and /lens/home render identical output', async () => {
    const container = await makeContainer();
    resetStackStore();
    const indexHtml = await container.renderToString(IndexPage, {});
    resetStackStore();
    const lensHtml = await container.renderToString(LensNamePage, { params: { name: 'home' } });

    expect(indexHtml).toBe(lensHtml);
  });

  it('/ renders the home lens in page mode (site-header chrome, no bespoke front page)', async () => {
    const container = await makeContainer();
    resetStackStore();
    const html = await container.renderToString(IndexPage, {});
    const div = dom(html);

    const card = div.querySelector('.stack-card--page');
    expect(card?.getAttribute('data-uid')).toBe('lens/home');
    expect(div.querySelector('.page-title')?.textContent).toContain('pdyxs.wtf');
    expect(div.querySelector('.page-subtitle')?.textContent).toContain('A bit of everything');
    // The bespoke front-page filter bar / site-header markup is gone.
    expect(div.querySelector('.site-header')).toBeNull();
  });
});
