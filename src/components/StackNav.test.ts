import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { getContainerRenderer } from '@astrojs/svelte';
import svelteServerRenderer from '@astrojs/svelte/server.js';
import StackNav from './StackNav.astro';

async function makeContainer() {
  const renderers = [{ ...getContainerRenderer(), ssr: svelteServerRenderer }];
  return AstroContainer.create({ renderers });
}

describe('StackNav', () => {
  it('renders_card_stack_element: renders a client:load island', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(StackNav, { props: {} });
    const div = document.createElement('div');
    div.innerHTML = html;
    // client:load islands render as <astro-island client="load">
    const island = div.querySelector('astro-island[client="load"]');
    expect(island).not.toBeNull();
  });

  it('forwards_activeUid_prop: passes activeUid to the CardStack island', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(StackNav, {
      props: { activeUid: 'test/id' },
    });
    // The prop should be serialized into the island's props attribute
    expect(html).toContain('test/id');
  });
});
