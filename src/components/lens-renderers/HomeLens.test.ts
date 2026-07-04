import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { getContainerRenderer } from '@astrojs/svelte';
import svelteServerRenderer from '@astrojs/svelte/server.js';
import HomeLens from './HomeLens.astro';

async function makeContainer() {
  const renderers = [{ ...getContainerRenderer(), ssr: svelteServerRenderer }];
  return AstroContainer.create({ renderers });
}

function dom(html: string) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

describe('HomeLens', () => {
  // The chrome (header, body-wrapper, close button) is owned by
  // LensStackCard.astro — this component renders body content only.
  it('renders the day-seeded front-page slots island', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(HomeLens, { props: {} });
    const div = dom(html);

    expect(div.querySelector('.front-page-slots')).not.toBeNull();
  });

  it('renders no chrome of its own (no header/body-wrapper)', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(HomeLens, { props: {} });
    const div = dom(html);

    expect(div.querySelector('.card-header')).toBeNull();
    expect(div.querySelector('.body-wrapper')).toBeNull();
  });
});
