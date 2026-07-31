// Pure share/discovery metadata decisions (issue #71): canonical URL, Open
// Graph + Twitter Card tags, and JSON-LD documents.
//
// Everything here takes plain data and returns plain data — Base.astro is the
// thin applier that loops the returned tag list into <meta> elements and
// serialises the JSON-LD. Nothing in this module touches Astro, the DOM, or
// astro:assets; image *resolution* (local asset → emitted URL) happens in the
// route and arrives here as a plain string.

import { SITE_TITLE } from './lens-chrome';

/** The site's name, shared with the lens chrome so the two can't drift. */
export const SITE_NAME = SITE_TITLE;
export const SITE_AUTHOR = 'Paul Sztajer';

/**
 * Fallback origin for the rare case `Astro.site` is unset. Astro.config sets
 * `site`, so this is type narrowing rather than real configuration — but every
 * consumer must share it, or canonical URLs and sitemap <loc>s could disagree.
 */
export const SITE_URL = 'https://pdyxs.wtf';
export const SITE_DESCRIPTION = 'Paul Sztajer — writing, projects, and work';

/**
 * Site-level fallback share image, used whenever a card has no usable header
 * image. Lives in public/ (not src/) so it needs no asset pipeline and its URL
 * is stable across builds — social scrapers cache aggressively.
 */
export const DEFAULT_OG_IMAGE = '/og-default.png';

/** Joins a site origin and a path (or passes an already-absolute URL through). */
export function absoluteUrl(pathOrUrl: string, site: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const origin = site.replace(/\/+$/, '');
  return `${origin}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
}

/**
 * The canonical URL for a page: the site origin plus a normalised pathname.
 * Normalisation strips any `index.html` and forces exactly one trailing slash,
 * matching Astro's default `directory` build format — so the URL a scraper is
 * told about is the URL the host actually serves.
 */
export function resolveCanonical(pathname: string, site: string): string {
  let path = pathname.replace(/index\.html?$/i, '');
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/\/+$/, '');
  return `${site.replace(/\/+$/, '')}${path}/`;
}

/**
 * Resolves the share image URL: the card's own resolved image when it has one,
 * else the site-level default. Always absolute — relative og:image values are
 * unreliable across scrapers.
 */
export function resolveOgImage(cardImage: string | undefined, site: string): string {
  const trimmed = cardImage?.trim();
  return absoluteUrl(trimmed || DEFAULT_OG_IMAGE, site);
}

export type MetaTag = { property?: string; name?: string; content: string };

export type SeoPage = {
  /** The page's own title (not the "— pdyxs.wtf" suffixed document title). */
  title: string;
  description?: string;
  /** Absolute canonical URL — see resolveCanonical. */
  canonical: string;
  /** Absolute image URL — see resolveOgImage. */
  image: string;
  /** `article` for a dated card, `website` for lenses and the front page. */
  type: 'article' | 'website';
  /** ISO-8601 publish time; emitted as article:published_time when type is article. */
  publishedTime?: string;
};

/**
 * The full Open Graph + Twitter Card tag list for a page. Emitted in document
 * order by Base.astro. `description` tags are omitted rather than emitted
 * empty when the page has no description (see resolveDescription).
 */
export function buildSocialMeta(page: SeoPage): MetaTag[] {
  const tags: MetaTag[] = [
    { property: 'og:site_name', content: SITE_NAME },
    { property: 'og:type', content: page.type },
    { property: 'og:title', content: page.title },
    { property: 'og:url', content: page.canonical },
    { property: 'og:image', content: page.image },
  ];

  if (page.description) {
    tags.push({ property: 'og:description', content: page.description });
  }
  if (page.type === 'article' && page.publishedTime) {
    tags.push({ property: 'article:published_time', content: page.publishedTime });
    tags.push({ property: 'article:author', content: SITE_AUTHOR });
  }

  // summary_large_image: every share carries an image (card's own or the
  // site default), so the small-thumbnail variant would always under-sell it.
  tags.push({ name: 'twitter:card', content: 'summary_large_image' });
  tags.push({ name: 'twitter:title', content: page.title });
  if (page.description) {
    tags.push({ name: 'twitter:description', content: page.description });
  }
  tags.push({ name: 'twitter:image', content: page.image });

  return tags;
}

export type JsonLd = Record<string, unknown>;

/** schema.org Article for a dated card. */
export function buildArticleJsonLd(page: SeoPage): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: page.title,
    ...(page.description ? { description: page.description } : {}),
    url: page.canonical,
    image: page.image,
    ...(page.publishedTime ? { datePublished: page.publishedTime } : {}),
    author: { '@type': 'Person', name: SITE_AUTHOR, url: absoluteUrl('/', siteFromCanonical(page.canonical)) },
    publisher: { '@type': 'Person', name: SITE_AUTHOR },
    mainEntityOfPage: { '@type': 'WebPage', '@id': page.canonical },
  };
}

/** Recovers the site origin from an absolute canonical URL. */
function siteFromCanonical(canonical: string): string {
  const match = canonical.match(/^(https?:\/\/[^/]+)/i);
  return match ? match[1] : canonical;
}

/**
 * Root-level identity: the Person the site is about and the WebSite itself.
 * Emitted on every page as a single `@graph` so a crawler landing on any card
 * still resolves the site identity.
 */
export function buildSiteJsonLd(site: string): JsonLd {
  const origin = absoluteUrl('/', site);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Person',
        '@id': `${origin}#person`,
        name: SITE_AUTHOR,
        url: origin,
      },
      {
        '@type': 'WebSite',
        '@id': `${origin}#website`,
        name: SITE_NAME,
        url: origin,
        description: SITE_DESCRIPTION,
        author: { '@id': `${origin}#person` },
        publisher: { '@id': `${origin}#person` },
      },
    ],
  };
}
