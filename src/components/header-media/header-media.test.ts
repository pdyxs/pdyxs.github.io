// Server-render tests for the header-media wrappers: the Astro ↔ Svelte seam.
//
// The island tests (LinoCanvas.island.test.ts, stars/StarSystem.island.test.ts)
// cover behaviour once mounted, but a Svelte island reaches the page through
// its .astro wrapper — Astro server-renders it and wraps it in an
// <astro-island> that hydrates on load. An Astro or @astrojs/svelte upgrade
// breaks that seam first, and it is only visible here: in the `astro` vitest
// project, rendering the real wrappers through the container.
import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { getContainerRenderer } from '@astrojs/svelte';
import svelteServerRenderer from '@astrojs/svelte/server.js';
import LinoCanvas from '@components/header-media/LinoCanvas.astro';
import StarSystem from '@components/header-media/stars/StarSystem.astro';
import { resolveHeaderMedia } from '@render/renderers';
import type { HeaderMediaImage } from '@render/header-media';

const IMAGES: HeaderMediaImage[] = [1, 2, 3, 4, 5].map((n) => ({
  filename: `lino-${n}.jpg`,
  src: `/img/lino-${n}.jpg`,
  width: 500,
  height: 500,
}));

async function render(Component: Parameters<AstroContainer['renderToString']>[0], entryId: string, images = IMAGES) {
  const container = await AstroContainer.create({
    renderers: [{ ...getContainerRenderer(), ssr: svelteServerRenderer }],
  });
  const div = document.createElement('div');
  div.innerHTML = await container.renderToString(Component, { props: { entryId, images } });
  return div;
}

describe('header-media wrappers', () => {
  it('registers both islands by their headerMedia names', () => {
    expect(resolveHeaderMedia('lino-canvas')).toBe(LinoCanvas);
    expect(resolveHeaderMedia('star-system')).toBe(StarSystem);
  });

  it('LinoCanvas server-renders inside an island that hydrates on load', async () => {
    const div = await render(LinoCanvas, 'what/art/lino-printing');
    const island = div.querySelector('astro-island')!;
    expect(island).not.toBeNull();
    expect(island.getAttribute('client')).toBe('load');

    // The initial state is in the HTML before any JS runs: an empty canvas
    // offering all five tiles.
    expect(island.querySelector<HTMLElement>('.lino-canvas')!.dataset.entry).toBe('what/art/lino-printing');
    expect(
      [...island.querySelectorAll('.image-placeable img')].map((i) => i.getAttribute('src')),
    ).toEqual(IMAGES.map((i) => i.src));
  });

  it('StarSystem server-renders inside an island that hydrates on load', async () => {
    const div = await render(StarSystem, 'what/toys/star-navigation', []);
    const island = div.querySelector('astro-island')!;
    expect(island).not.toBeNull();
    expect(island.getAttribute('client')).toBe('load');

    expect(island.querySelectorAll('.planet-hit')).toHaveLength(4);
    expect(island.querySelector('.star-reset')).toBeNull();
  });
});
