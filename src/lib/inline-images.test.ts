import { describe, it, expect } from 'vitest';
import { bodyHasInlineImage, INLINE_BODY_IMAGE_SELECTOR, isInlineBodyImage, collectInlineImages } from './inline-images';

describe('bodyHasInlineImage', () => {
  it('is false for no body', () => {
    expect(bodyHasInlineImage(undefined)).toBe(false);
    expect(bodyHasInlineImage('')).toBe(false);
  });

  it('is false for prose with no image', () => {
    expect(bodyHasInlineImage('Some prose with a [link](https://example.com).')).toBe(false);
  });

  it('finds a markdown image, with or without alt text', () => {
    expect(bodyHasInlineImage('![](example-1.png)')).toBe(true);
    expect(bodyHasInlineImage('![A worked example](example-1.png)')).toBe(true);
  });

  it('finds a raw <img> tag', () => {
    expect(bodyHasInlineImage('<img src="x.png">')).toBe(true);
  });
});

describe('isInlineBodyImage', () => {
  function bodyWith(html: string) {
    const root = document.createElement('div');
    root.className = 'stack-card-body-inner';
    root.innerHTML = html;
    return root;
  }

  it('accepts an image the markdown wrapped in a paragraph', () => {
    const root = bodyWith('<p><img src="a.png"></p>');
    expect(isInlineBodyImage(root.querySelector('img'), root)).toBe(true);
  });

  it('accepts an image inside a list item', () => {
    const root = bodyWith('<ul><li><img src="a.png"></li></ul>');
    expect(isInlineBodyImage(root.querySelector('img'), root)).toBe(true);
  });

  it('rejects a masthead image, which is not in body flow', () => {
    const root = bodyWith('<div class="generic-bleed"><img src="a.png" class="generic-image"></div>');
    expect(isInlineBodyImage(root.querySelector('img'), root)).toBe(false);
  });

  it('rejects an image in a different card of the stack', () => {
    const mine = bodyWith('<p>nothing here</p>');
    const theirs = bodyWith('<p><img src="a.png"></p>');
    expect(isInlineBodyImage(theirs.querySelector('img'), mine)).toBe(false);
  });

  it('rejects a click on something that is not an image', () => {
    const root = bodyWith('<p>text</p>');
    expect(isInlineBodyImage(root.querySelector('p'), root)).toBe(false);
    expect(isInlineBodyImage(null, root)).toBe(false);
  });
});

describe('collectInlineImages', () => {
  it('returns every body image in document order, with alt text', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p><img src="a.png" alt="first"></p><p>prose</p><li><img src="b.png" alt="second"></li>';
    const images = collectInlineImages(root);
    // src comes back resolved against the document base URL, so match the tail.
    expect(images.map(i => i.alt)).toEqual(['first', 'second']);
    expect(images[0].src.endsWith('a.png')).toBe(true);
    expect(images[1].src.endsWith('b.png')).toBe(true);
  });

  it('exposes the selector the CSS cap shares', () => {
    expect(INLINE_BODY_IMAGE_SELECTOR).toBe(':is(p, li) > img');
  });
});
