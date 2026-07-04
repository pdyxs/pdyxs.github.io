import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { getContainerRenderer } from '@astrojs/svelte';
import svelteServerRenderer from '@astrojs/svelte/server.js';
import NewestLens from './NewestLens.astro';

async function makeContainer() {
  const renderers = [{ ...getContainerRenderer(), ssr: svelteServerRenderer }];
  return AstroContainer.create({ renderers });
}

function dom(html: string) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

function countText(div: HTMLDivElement): string | undefined {
  return div.querySelector('.fp-result-count')?.textContent?.trim();
}

describe('NewestLens', () => {
  // The header is owned by LensStackCard.astro — this component renders body
  // content only (the browsing island + result count).
  it('renders the browse result count', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(NewestLens, {
      props: {},
      request: new Request('https://example.com/lens/newest'),
    });
    const div = dom(html);

    expect(div.querySelector('.fp-result-count')).not.toBeNull();
  });

  it('renders every card when no filter is present in the request', async () => {
    const container = await makeContainer();
    const html = await container.renderToString(NewestLens, {
      props: {},
      request: new Request('https://example.com/lens/newest'),
    });
    const div = dom(html);
    expect(countText(div)).toMatch(/^\d+ cards?$/);
    const unfiltered = Number(countText(div)!.match(/\d+/)![0]);
    expect(unfiltered).toBeGreaterThan(0);
  });

  // AstroContainer's `request` option is the one place this route's
  // filterStateFromParams()+applyFilters() wiring is actually exercised with a
  // query string — a real deployed request never reaches it (this is a fully
  // static, getStaticPaths-prerendered route: see NewestLens.astro's header
  // comment). The real, user-visible narrowing comes from
  // NewestLensBrowser.svelte reading window.location.search on hydration.
  it('applies filter.<dim> query params server-side, narrowing the rendered set (reuses applyFilters)', async () => {
    const container = await makeContainer();

    const allHtml = await container.renderToString(NewestLens, {
      props: {},
      request: new Request('https://example.com/lens/newest'),
    });
    const allCount = Number(dom(allHtml).querySelector('.fp-result-count')!.textContent!.match(/\d+/)![0]);

    const filteredHtml = await container.renderToString(NewestLens, {
      props: {},
      request: new Request('https://example.com/lens/newest?filter.what=what%3Apuzzles'),
    });
    const filteredDiv = dom(filteredHtml);
    const filteredCount = Number(filteredDiv.querySelector('.fp-result-count')!.textContent!.match(/\d+/)![0]);

    expect(filteredCount).toBeGreaterThan(0);
    expect(filteredCount).toBeLessThan(allCount);
  });
});
