import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import ThemeToggle from './ThemeToggle.astro';

describe('ThemeToggle', () => {
  it('renders three buttons', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ThemeToggle, { props: {} });
    const div = document.createElement('div');
    div.innerHTML = html;
    const buttons = div.querySelectorAll('button');
    expect(buttons).toHaveLength(3);
  });

  it('buttons have correct aria-labels', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ThemeToggle, { props: {} });
    const div = document.createElement('div');
    div.innerHTML = html;
    const labels = Array.from(div.querySelectorAll('button')).map(
      (b) => b.getAttribute('aria-label'),
    );
    expect(labels).toContain('Light');
    expect(labels).toContain('System');
    expect(labels).toContain('Dark');
  });

  it('each button contains an inline svg', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ThemeToggle, { props: {} });
    const div = document.createElement('div');
    div.innerHTML = html;
    const buttons = div.querySelectorAll('button');
    buttons.forEach((btn) => {
      expect(btn.querySelector('svg')).not.toBeNull();
    });
  });
});
