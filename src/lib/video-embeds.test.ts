import { describe, it, expect } from 'vitest';
import { paragraphEmbed, rehypeVideoEmbeds } from './video-embeds.ts';

type Node = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
};

const text = (value: string): Node => ({ type: 'text', value });
const anchor = (href: string, label = href): Node => ({
  type: 'element',
  tagName: 'a',
  properties: { href },
  children: [text(label)],
});
const paragraph = (...children: Node[]): Node => ({
  type: 'element',
  tagName: 'p',
  properties: {},
  children,
});

describe('paragraphEmbed', () => {
  it('matches a paragraph holding only an autolinked video URL', () => {
    const embed = paragraphEmbed(paragraph(anchor('https://www.youtube.com/watch?v=u0nnn_4ZKGs')));
    expect(embed?.id).toBe('u0nnn_4ZKGs');
  });

  it('ignores whitespace around the link', () => {
    const p = paragraph(text('\n  '), anchor('https://vimeo.com/257695244'), text('\n'));
    expect(paragraphEmbed(p)?.provider).toBe('vimeo');
  });

  it('leaves a link with its own label alone', () => {
    // "[the talk](youtu.be/…)" is prose the author wrote deliberately.
    const p = paragraph(anchor('https://youtu.be/BZxVzL2ssms', 'the talk'));
    expect(paragraphEmbed(p)).toBeUndefined();
  });

  it('leaves a video link mentioned mid-sentence alone', () => {
    const p = paragraph(
      text('So I was thinking about '),
      anchor('https://www.youtube.com/watch?v=oP3c1h8v2ZQ'),
      text(' again.'),
    );
    expect(paragraphEmbed(p)).toBeUndefined();
  });

  it('leaves a non-video link alone', () => {
    expect(paragraphEmbed(paragraph(anchor('https://example.com/post')))).toBeUndefined();
  });

  it('ignores non-paragraph nodes', () => {
    expect(paragraphEmbed(anchor('https://vimeo.com/257695244'))).toBeUndefined();
  });
});

describe('rehypeVideoEmbeds', () => {
  it('replaces the paragraph with a responsive figure', () => {
    const tree: Node = {
      type: 'root',
      children: [paragraph(anchor('https://www.youtube.com/watch?v=u0nnn_4ZKGs'))],
    };
    rehypeVideoEmbeds()(tree);

    const figure = tree.children![0];
    expect(figure.tagName).toBe('figure');
    expect(figure.properties?.className).toEqual(['video-embed']);
    expect(figure.properties?.['data-provider']).toBe('youtube');

    const iframe = figure.children![0];
    expect(iframe.tagName).toBe('iframe');
    expect(iframe.properties?.src).toBe('https://www.youtube-nocookie.com/embed/u0nnn_4ZKGs');
    expect(iframe.properties?.allowfullscreen).toBe(true);
    // No fixed width/height — the Jekyll markup's 560×315 is what overflowed.
    expect(iframe.properties?.width).toBeUndefined();
    expect(iframe.properties?.height).toBeUndefined();
  });

  it('rewrites embeds nested inside other block elements', () => {
    const tree: Node = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'blockquote',
          children: [paragraph(anchor('https://vimeo.com/257695244'))],
        },
      ],
    };
    rehypeVideoEmbeds()(tree);
    expect(tree.children![0].children![0].tagName).toBe('figure');
  });

  it('leaves a tree with no video links untouched', () => {
    const tree: Node = {
      type: 'root',
      children: [paragraph(text('no videos here')), paragraph(anchor('https://example.com'))],
    };
    rehypeVideoEmbeds()(tree);
    expect(tree.children!.every(child => child.tagName === 'p')).toBe(true);
  });
});
