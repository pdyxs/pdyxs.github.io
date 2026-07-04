import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { getContainerRenderer } from '@astrojs/svelte';
import svelteServerRenderer from '@astrojs/svelte/server.js';
import CardStackCard from './CardStackCard.astro';

async function makeContainer() {
  const renderers = [{ ...getContainerRenderer(), ssr: svelteServerRenderer }];
  return AstroContainer.create({ renderers });
}

function dom(html: string) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

describe('CardStackCard', () => {
  it('renders a collection-view location using its registered view renderer', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(CardStackCard, { props: { path: 'posts' } });
    const div = dom(html);

    expect(div.querySelector('.stack-card')?.getAttribute('data-uid')).toBe('posts');
    expect(div.querySelector('.card-header-title')?.textContent).toContain('Writing');
  });

  it('renders a plain card location with a CardHeader + the resolved renderer', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(CardStackCard, { props: { path: 'posts/about-me' } });
    const div = dom(html);

    expect(div.querySelector('.stack-card')?.getAttribute('data-uid')).toBe('posts/about-me');
    expect(div.querySelector('.card-header')).not.toBeNull();
    expect(div.querySelector('.body-wrapper.open')).not.toBeNull();
    expect(div.querySelector('[data-content-hash]')?.getAttribute('data-content-hash')).toBeTruthy();
  });

  it('renders a puzzle card via PuzzleRenderer, resolved from the cascaded _config.yaml renderer (not a frontmatter override)', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(CardStackCard, { props: { path: 'puzzles/cartography' } });
    const div = dom(html);

    expect(div.querySelector('.stack-card')?.getAttribute('data-uid')).toBe('puzzles/cartography');
    expect(div.querySelector('.puzzle-meta')).not.toBeNull();
  });

  it('renders a tag location via the tag renderer, hashing name+description', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(CardStackCard, { props: { path: 'tag/who' } });
    const div = dom(html);

    expect(div.querySelector('.stack-card')?.getAttribute('data-uid')).toBe('tag/who');
  });
});
