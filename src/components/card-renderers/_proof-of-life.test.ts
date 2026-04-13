import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import GenericRenderer from './GenericRenderer.astro';
import { fakeEntry } from '../../test/fixtures';

describe('GenericRenderer', () => {
  it('renders description text', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(GenericRenderer, {
      props: { entry: fakeEntry({ description: 'hello proof of life' }), Content: undefined },
    });

    const div = document.createElement('div');
    div.innerHTML = html;
    expect(div.textContent).toContain('hello proof of life');
  });
});
