import { describe, it, expect } from 'vitest';
import { isExternalHref, rehypeExternalLinks } from './external-links.ts';

describe('isExternalHref', () => {
  it('treats off-site http(s) links as external', () => {
    expect(isExternalHref('https://twitter.com/pdyxs')).toBe(true);
    expect(isExternalHref('http://www.igda.org/')).toBe(true);
  });

  it('treats the site itself as internal', () => {
    expect(isExternalHref('https://pdyxs.wtf/card/what/writing')).toBe(false);
    expect(isExternalHref('https://www.pdyxs.wtf/')).toBe(false);
  });

  it('leaves the in-stack protocols alone', () => {
    expect(isExternalHref('card:what/games/digital/numbeanies')).toBe(false);
    expect(isExternalHref('collection:what:posts')).toBe(false);
    expect(isExternalHref('tag:where:europe/norway/svalbard')).toBe(false);
  });

  it('leaves relative paths, fragments and mailto alone', () => {
    expect(isExternalHref('./game-jam-1.jpg')).toBe(false);
    expect(isExternalHref('/card/posts')).toBe(false);
    expect(isExternalHref('#section')).toBe(false);
    expect(isExternalHref('mailto:pdsteja@gmail.com')).toBe(false);
  });

  it('is safe on empty or malformed input', () => {
    expect(isExternalHref(undefined)).toBe(false);
    expect(isExternalHref('')).toBe(false);
    expect(isExternalHref('http://')).toBe(false);
  });
});

describe('rehypeExternalLinks', () => {
  const anchor = (href: string) => ({
    type: 'element',
    tagName: 'a',
    properties: { href },
    children: [],
  });

  it('annotates external anchors at any depth', () => {
    const external = anchor('https://dropbox.com/');
    const internal = anchor('card:what/writing');
    const tree = {
      type: 'root',
      children: [
        { type: 'element', tagName: 'p', properties: {}, children: [external] },
        internal,
      ],
    };

    rehypeExternalLinks()(tree);

    expect(external.properties).toEqual({
      href: 'https://dropbox.com/',
      target: '_blank',
      rel: 'noopener noreferrer',
    });
    expect(internal.properties).toEqual({ href: 'card:what/writing' });
  });

  it('ignores non-anchor elements with an href-like property', () => {
    const link = {
      type: 'element',
      tagName: 'link',
      properties: { href: 'https://example.com/style.css' },
      children: [],
    };
    rehypeExternalLinks()({ type: 'root', children: [link] });
    expect(link.properties).toEqual({ href: 'https://example.com/style.css' });
  });
});
