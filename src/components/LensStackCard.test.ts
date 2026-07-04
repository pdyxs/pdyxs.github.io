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
    expect(div.querySelector('.page-subtitle')?.textContent).toContain('Games, Design and Software');
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

  it('omits data-width when the lens declares no width (falls back to the global default)', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(LensStackCard, { props: { name: 'home' } });
    const div = dom(html);

    expect(div.querySelector('.stack-card')?.hasAttribute('data-width')).toBe(false);
  });

  it('falls back to a not-found message for an unregistered lens name', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(LensStackCard, { props: { name: 'does-not-exist' } });
    const div = dom(html);

    expect(div.querySelector('.lens-not-found')?.textContent).toContain('does-not-exist');
  });
});
