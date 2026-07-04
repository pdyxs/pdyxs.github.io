import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { getContainerRenderer } from '@astrojs/svelte';
import svelteServerRenderer from '@astrojs/svelte/server.js';
import IndexPage from '../pages/index.astro';
import LensNamePage from '../pages/lens/[name].astro';

async function makeContainer() {
  const renderers = [{ ...getContainerRenderer(), ssr: svelteServerRenderer }];
  return AstroContainer.create({ renderers });
}

function dom(html: string) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

describe('/ folds into the home lens', () => {
  it('/ and /lens/home render identical output', async () => {
    const container = await makeContainer();
    const indexHtml = await container.renderToString(IndexPage, {});
    const lensHtml = await container.renderToString(LensNamePage, { params: { name: 'home' } });

    expect(indexHtml).toBe(lensHtml);
  });

  it('/ renders the home lens in page mode (site-header chrome, no bespoke front page)', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(IndexPage, {});
    const div = dom(html);

    const card = div.querySelector('.stack-card--page');
    expect(card?.getAttribute('data-uid')).toBe('lens/home');
    expect(div.querySelector('.page-title')?.textContent).toContain('pdyxs.wtf');
    expect(div.querySelector('.page-subtitle')?.textContent).toContain('Games, Design and Software');
    // The bespoke front-page filter bar / site-header markup is gone.
    expect(div.querySelector('.site-header')).toBeNull();
  });
});
