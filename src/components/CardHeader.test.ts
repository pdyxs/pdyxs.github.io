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

  it('renders no status badge when status is absent', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(CardHeader, {
      props: { title: 'Title' },
    });
    const div = document.createElement('div');
    div.innerHTML = html;
    expect(div.querySelector('.status-badge')).toBeNull();
  });

  it('renders no status badge for a published status', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(CardHeader, {
      props: { title: 'Title', status: 'published' },
    });
    const div = document.createElement('div');
    div.innerHTML = html;
    expect(div.querySelector('.status-badge')).toBeNull();
  });

  it('renders a Draft status badge in DEV', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(CardHeader, {
      props: { title: 'Title', status: 'draft' },
    });
    const div = document.createElement('div');
    div.innerHTML = html;
    const badge = div.querySelector('.status-badge.status-badge--draft');
    expect(badge?.textContent?.trim()).toBe('Draft');
  });

  it('renders a Scheduled status badge with its date', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(CardHeader, {
      props: { title: 'Title', status: 'scheduled', date: new Date('2027-03-15') },
    });
    const div = document.createElement('div');
    div.innerHTML = html;
    const badge = div.querySelector('.status-badge.status-badge--scheduled');
    expect(badge?.textContent).toContain('Scheduled');
    expect(badge?.textContent).toContain('15 Mar 2027');
  });
});
