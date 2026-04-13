import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import CardLink from './CardLink.astro';

describe('CardLink', () => {
  it('sets data-push-card to uid', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(CardLink, {
      props: { uid: 'posts/my-post', title: 'My Post' },
    });
    const div = document.createElement('div');
    div.innerHTML = html;
    expect(div.querySelector('[data-push-card]')?.getAttribute('data-push-card')).toBe('posts/my-post');
  });

  it('renders title via CardHeader', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(CardLink, {
      props: { uid: 'posts/my-post', title: 'My Post Title' },
    });
    const div = document.createElement('div');
    div.innerHTML = html;
    expect(div.textContent).toContain('My Post Title');
  });
});
