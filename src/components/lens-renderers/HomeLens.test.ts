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
  it('renders a CardHeader titled "Home" with an open body-wrapper', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(HomeLens, { props: {} });
    const div = dom(html);

    expect(div.querySelector('.card-header-title')?.textContent).toContain('Home');
    expect(div.querySelector('.body-wrapper.open')).not.toBeNull();
  });

  it('renders a close button, matching the shell shape of other card renderers', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(HomeLens, { props: {} });
    const div = dom(html);

    expect(div.querySelector('.stack-card-close')).not.toBeNull();
  });
});
