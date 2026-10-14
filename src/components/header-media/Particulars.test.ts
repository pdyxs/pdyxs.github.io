// Server-render test for the Particulars wrapper: the glob + validate + island seam.
import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { getContainerRenderer } from '@astrojs/svelte/container-renderer';
import svelteServerRenderer from '@astrojs/svelte/server.js';
import Particulars from '@components/header-media/Particulars.astro';
import { resolveHeaderMedia } from '@render/renderers';

async function render(entryId: string) {
  const container = await AstroContainer.create({
    renderers: [{ ...getContainerRenderer(), ssr: svelteServerRenderer }],
  });
  const div = document.createElement('div');
  div.innerHTML = await container.renderToString(Particulars, { props: { entryId, images: [] } });
  return div;
}

describe('Particulars wrapper', () => {
  it('is registered as headerMedia: particulars', () => {
    expect(resolveHeaderMedia('particulars')).toBe(Particulars);
  });

  it('server-renders the sample card scenario inside an island that hydrates on load', async () => {
    const div = await render('what/toys/particulars');
    const island = div.querySelector('astro-island')!;
    expect(island.getAttribute('client')).toBe('load');
    const svg = island.querySelector('svg.particulars')!;
    expect(svg.getAttribute('viewBox')).toBe('-12.5 -6.5 25 13');
    expect(svg.querySelector('g.player')!.getAttribute('data-type')).toBe('down');
  });

  it('fails the render, readably, for a card with no scenario', async () => {
    await expect(render('what/toys/star-navigation')).rejects.toThrow(/has no index\.json/);
  });
});
