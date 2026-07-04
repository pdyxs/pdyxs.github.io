import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { getContainerRenderer } from '@astrojs/svelte';
import svelteServerRenderer from '@astrojs/svelte/server.js';
import LensStackCard from './LensStackCard.astro';

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
    expect(div.querySelector('.card-header-title')?.textContent).toContain('Home');
  });

  it('renders the newest lens with the "lens/newest" data-uid', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(LensStackCard, { props: { name: 'newest' } });
    const div = dom(html);

    expect(div.querySelector('.stack-card')?.getAttribute('data-uid')).toBe('lens/newest');
    expect(div.querySelector('.card-header-title')?.textContent).toContain('Newest');
  });

  it('falls back to a not-found message for an unregistered lens name', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(LensStackCard, { props: { name: 'does-not-exist' } });
    const div = dom(html);

    expect(div.querySelector('.lens-not-found')?.textContent).toContain('does-not-exist');
  });
});
