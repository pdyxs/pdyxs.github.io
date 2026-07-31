import { describe, it, expect } from 'vitest';
import {
  absoluteUrl,
  resolveCanonical,
  resolveOgImage,
  buildSocialMeta,
  buildArticleJsonLd,
  buildSiteJsonLd,
  DEFAULT_OG_IMAGE,
  SITE_AUTHOR,
  SITE_NAME,
} from './seo';
import type { SeoPage } from './seo';

const SITE = 'https://pdyxs.wtf';

function page(overrides: Partial<SeoPage> = {}): SeoPage {
  return {
    title: 'A card',
    description: 'A description.',
    canonical: `${SITE}/card/what/posts/a/`,
    image: `${SITE}/og-default.png`,
    type: 'website',
    ...overrides,
  };
}

describe('absoluteUrl', () => {
  it('joins a root-relative path onto the site origin', () => {
    expect(absoluteUrl('/og-default.png', SITE)).toBe(`${SITE}/og-default.png`);
    expect(absoluteUrl('og-default.png', `${SITE}/`)).toBe(`${SITE}/og-default.png`);
  });

  it('passes an already-absolute URL through untouched', () => {
    expect(absoluteUrl('https://cdn.example.com/a.jpg', SITE)).toBe('https://cdn.example.com/a.jpg');
  });
});

describe('resolveCanonical', () => {
  it('normalises to one trailing slash (Astro directory build format)', () => {
    expect(resolveCanonical('/card/what/posts/a', SITE)).toBe(`${SITE}/card/what/posts/a/`);
    expect(resolveCanonical('/card/what/posts/a/', SITE)).toBe(`${SITE}/card/what/posts/a/`);
  });

  it('strips index.html', () => {
    expect(resolveCanonical('/lens/newest/index.html', SITE)).toBe(`${SITE}/lens/newest/`);
  });

  it('handles the root path', () => {
    expect(resolveCanonical('/', SITE)).toBe(`${SITE}/`);
  });

  it('ignores a trailing slash on the site origin', () => {
    expect(resolveCanonical('/a', `${SITE}/`)).toBe(`${SITE}/a/`);
  });
});

describe('resolveOgImage', () => {
  it("uses the card's own resolved image when it has one", () => {
    expect(resolveOgImage('/_astro/header.abc.webp', SITE)).toBe(`${SITE}/_astro/header.abc.webp`);
  });

  it('keeps a remote card image absolute and unmodified', () => {
    expect(resolveOgImage('https://cdn.example.com/a.jpg', SITE)).toBe('https://cdn.example.com/a.jpg');
  });

  it('falls back to the site-level default when the card has no image', () => {
    expect(resolveOgImage(undefined, SITE)).toBe(`${SITE}${DEFAULT_OG_IMAGE}`);
    expect(resolveOgImage('', SITE)).toBe(`${SITE}${DEFAULT_OG_IMAGE}`);
    expect(resolveOgImage('   ', SITE)).toBe(`${SITE}${DEFAULT_OG_IMAGE}`);
  });
});

describe('buildSocialMeta', () => {
  function contentOf(tags: ReturnType<typeof buildSocialMeta>, key: string): string | undefined {
    return tags.find(t => t.property === key || t.name === key)?.content;
  }

  it('emits the core OG set plus a large-image Twitter card', () => {
    const tags = buildSocialMeta(page());
    expect(contentOf(tags, 'og:site_name')).toBe(SITE_NAME);
    expect(contentOf(tags, 'og:type')).toBe('website');
    expect(contentOf(tags, 'og:title')).toBe('A card');
    expect(contentOf(tags, 'og:url')).toBe(`${SITE}/card/what/posts/a/`);
    expect(contentOf(tags, 'og:image')).toBe(`${SITE}/og-default.png`);
    expect(contentOf(tags, 'og:description')).toBe('A description.');
    expect(contentOf(tags, 'twitter:card')).toBe('summary_large_image');
    expect(contentOf(tags, 'twitter:image')).toBe(`${SITE}/og-default.png`);
  });

  it('omits description tags entirely when there is no description', () => {
    const tags = buildSocialMeta(page({ description: undefined }));
    expect(tags.some(t => t.property === 'og:description' || t.name === 'twitter:description')).toBe(false);
  });

  it('adds article metadata only for dated article pages', () => {
    const article = buildSocialMeta(page({ type: 'article', publishedTime: '2026-01-02T00:00:00.000Z' }));
    expect(contentOf(article, 'article:published_time')).toBe('2026-01-02T00:00:00.000Z');
    expect(contentOf(article, 'article:author')).toBe(SITE_AUTHOR);

    const website = buildSocialMeta(page({ type: 'website', publishedTime: '2026-01-02T00:00:00.000Z' }));
    expect(website.some(t => t.property === 'article:published_time')).toBe(false);
  });
});

describe('buildArticleJsonLd', () => {
  it('describes a dated card as a schema.org Article', () => {
    const ld = buildArticleJsonLd(page({ type: 'article', publishedTime: '2026-01-02T00:00:00.000Z' }));
    expect(ld['@type']).toBe('Article');
    expect(ld.headline).toBe('A card');
    expect(ld.url).toBe(`${SITE}/card/what/posts/a/`);
    expect(ld.datePublished).toBe('2026-01-02T00:00:00.000Z');
    expect(ld.author).toEqual({ '@type': 'Person', name: SITE_AUTHOR, url: `${SITE}/` });
    expect(ld.mainEntityOfPage).toEqual({ '@type': 'WebPage', '@id': `${SITE}/card/what/posts/a/` });
  });

  it('omits datePublished and description when absent', () => {
    const ld = buildArticleJsonLd(page({ type: 'article', description: undefined }));
    expect('datePublished' in ld).toBe(false);
    expect('description' in ld).toBe(false);
  });
});

describe('buildSiteJsonLd', () => {
  it('emits a Person and a WebSite that reference each other', () => {
    const ld = buildSiteJsonLd(SITE);
    const graph = ld['@graph'] as Record<string, unknown>[];
    const person = graph.find(n => n['@type'] === 'Person')!;
    const website = graph.find(n => n['@type'] === 'WebSite')!;
    expect(person.name).toBe(SITE_AUTHOR);
    expect(person['@id']).toBe(`${SITE}/#person`);
    expect(website.url).toBe(`${SITE}/`);
    expect(website.author).toEqual({ '@id': `${SITE}/#person` });
  });

  it('is serialisable to JSON-LD without cycles', () => {
    expect(() => JSON.stringify(buildSiteJsonLd(SITE))).not.toThrow();
  });
});
