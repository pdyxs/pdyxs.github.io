import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { getContainerRenderer } from '@astrojs/svelte';
import svelteServerRenderer from '@astrojs/svelte/server.js';
import GenericRenderer from './GenericRenderer.astro';
import { fakeEntry } from '../../test/fixtures';

async function makeContainer() {
  const renderers = [{ ...getContainerRenderer(), ssr: svelteServerRenderer }];
  return AstroContainer.create({ renderers });
}

describe('GenericRenderer', () => {
  it('renders description text', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(GenericRenderer, {
      props: { entry: fakeEntry({ description: 'hello proof of life' }), Content: undefined },
    });

    const div = document.createElement('div');
    div.innerHTML = html;
    expect(div.textContent).toContain('hello proof of life');
  });

  it('renders nothing when entry is undefined', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(GenericRenderer, {
      props: { entry: undefined, Content: undefined },
    });

    const div = document.createElement('div');
    div.innerHTML = html;
    expect(div.textContent?.trim()).toBe('');
  });

  it('renders nothing when entry has no description and no Content', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(GenericRenderer, {
      props: { entry: fakeEntry({}), Content: undefined },
    });

    const div = document.createElement('div');
    div.innerHTML = html;
    expect(div.textContent?.trim()).toBe('');
  });

  it('resolves a bare image filename to the colocated local asset', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(GenericRenderer, {
      props: { entry: fakeEntry({ id: 'projects/art-heist', image: 'outside.jpg' }), Content: undefined },
    });

    const div = document.createElement('div');
    div.innerHTML = html;
    const src = div.querySelector('img.generic-image')?.getAttribute('src');
    expect(src).toContain('outside.jpg');
    expect(src).toContain('/_image?href=');
  });

  it('renders nothing when the bare filename has no colocated local asset', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(GenericRenderer, {
      props: { entry: fakeEntry({ id: 'projects/does-not-exist', image: 'missing.jpg' }), Content: undefined },
    });

    const div = document.createElement('div');
    div.innerHTML = html;
    expect(div.querySelector('img.generic-image')).toBeNull();
  });

  it('uses full image URLs as-is', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(GenericRenderer, {
      props: { entry: fakeEntry({ image: 'https://example.com/pic.jpg' }), Content: undefined },
    });

    const div = document.createElement('div');
    div.innerHTML = html;
    expect(div.querySelector('img.generic-image')?.getAttribute('src')).toBe('https://example.com/pic.jpg');
  });

  it('renders status and medium as meta fields', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(GenericRenderer, {
      props: { entry: fakeEntry({ status: 'current', medium: 'Mobile game' }), Content: undefined },
    });

    const div = document.createElement('div');
    div.innerHTML = html;
    expect(div.textContent).toContain('Status');
    expect(div.textContent).toContain('current');
    expect(div.textContent).toContain('Medium');
    expect(div.textContent).toContain('Mobile game');
  });

  it('renders a source note linking to canonical_url', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(GenericRenderer, {
      props: {
        entry: fakeEntry({ canonical_url: 'https://gamasutra.com/post', source: 'gamasutra' }),
        Content: undefined,
      },
    });

    const div = document.createElement('div');
    div.innerHTML = html;
    expect(div.textContent).toContain('Originally published on Gamasutra');
    expect(div.querySelector('a[href="https://gamasutra.com/post"]')).toBeTruthy();
  });

  it('renders quotes with attribution and source link', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(GenericRenderer, {
      props: {
        entry: fakeEntry({
          quotes: [{ quote: 'A great game.', by: 'Some Critic', in: { text: 'The Brag', url: 'https://thebrag.com' } }],
        }),
        Content: undefined,
      },
    });

    const div = document.createElement('div');
    div.innerHTML = html;
    expect(div.textContent).toContain('A great game.');
    expect(div.textContent).toContain('Some Critic');
    expect(div.querySelector('a[href="https://thebrag.com"]')?.textContent).toBe('The Brag');
  });

  it('renders a gallery of colocated images excluding the header image', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(GenericRenderer, {
      props: { entry: fakeEntry({ id: 'projects/art-heist', image: 'outside.jpg' }), Content: undefined },
    });

    const div = document.createElement('div');
    div.innerHTML = html;
    expect(div.querySelector('.image-gallery')).toBeNull();
  });

  it('renders a gallery from colocated images when no header image is set', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(GenericRenderer, {
      props: { entry: fakeEntry({ id: 'projects/art-heist' }), Content: undefined },
    });

    const div = document.createElement('div');
    div.innerHTML = html;
    expect(div.querySelectorAll('.image-gallery-thumb img')).toHaveLength(1);
  });

  it('renders a gallery from the images[] override', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(GenericRenderer, {
      props: {
        entry: fakeEntry({ id: 'projects/art-heist', image: 'outside.jpg', images: ['outside.jpg'] }),
        Content: undefined,
      },
    });

    const div = document.createElement('div');
    div.innerHTML = html;
    expect(div.querySelectorAll('.image-gallery-thumb img')).toHaveLength(1);
  });

  it('renders no gallery when there are no gallery images', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(GenericRenderer, {
      props: { entry: fakeEntry({ id: 'projects/does-not-exist' }), Content: undefined },
    });

    const div = document.createElement('div');
    div.innerHTML = html;
    expect(div.querySelector('.image-gallery')).toBeNull();
  });

  it('renders action links', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(GenericRenderer, {
      props: {
        entry: fakeEntry({ actions: [{ text: 'Play on iOS', url: 'https://apple.com/app' }] }),
        Content: undefined,
      },
    });

    const div = document.createElement('div');
    div.innerHTML = html;
    const link = div.querySelector('a.generic-action-link');
    expect(link?.textContent).toBe('Play on iOS');
    expect(link?.getAttribute('href')).toBe('https://apple.com/app');
  });

  it('renders tags as links using the tag: protocol, carrying the raw filter value', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(GenericRenderer, {
      props: {
        entry: fakeEntry({ tags: ['gamedev', 'who:about'] }),
        Content: undefined,
      },
    });

    const div = document.createElement('div');
    div.innerHTML = html;
    const links = div.querySelectorAll('a.generic-tag');
    expect(links).toHaveLength(2);
    expect(links[0].textContent).toBe('gamedev');
    expect(links[0].getAttribute('href')).toBe('tag:gamedev');
    expect(links[1].textContent).toBe('who:about');
    expect(links[1].getAttribute('href')).toBe('tag:who:about');
  });

  it('renders no tags list when entry has no tags', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(GenericRenderer, {
      props: { entry: fakeEntry({ description: 'x' }), Content: undefined },
    });

    const div = document.createElement('div');
    div.innerHTML = html;
    expect(div.querySelector('.generic-tags')).toBeNull();
  });
});
