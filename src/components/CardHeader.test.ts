import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import CardHeader from './CardHeader.astro';

describe('CardHeader', () => {
  it('renders title', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(CardHeader, {
      props: { title: 'My Card Title' },
    });
    const div = document.createElement('div');
    div.innerHTML = html;
    expect(div.textContent).toContain('My Card Title');
  });

  it('renders titleSuffix when provided', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(CardHeader, {
      props: { title: 'Title', titleSuffix: ' (draft)' },
    });
    const div = document.createElement('div');
    div.innerHTML = html;
    expect(div.textContent).toContain('(draft)');
  });

  it('omits titleSuffix when absent', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(CardHeader, {
      props: { title: 'Title' },
    });
    const div = document.createElement('div');
    div.innerHTML = html;
    const span = div.querySelector('.card-header-title');
    expect(span?.textContent?.trim()).toBe('Title');
  });
});
