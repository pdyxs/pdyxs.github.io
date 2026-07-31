import { describe, it, expect } from 'vitest';
import { resolveDescription, stripMarkdown, truncateAtWord, EXCERPT_MAX_LENGTH } from './description';

describe('resolveDescription', () => {
  it('prefers the hand-written description over a body excerpt', () => {
    expect(resolveDescription({ description: 'Hand written.' }, 'Body prose that would otherwise win.'))
      .toBe('Hand written.');
  });

  it('falls back to the body when the description is absent', () => {
    expect(resolveDescription({}, 'Body prose.')).toBe('Body prose.');
  });

  it('treats a blank/whitespace description as absent', () => {
    expect(resolveDescription({ description: '   ' }, 'Body prose.')).toBe('Body prose.');
  });

  it('strips markdown and HTML from the excerpt', () => {
    const body = [
      '# A heading',
      '',
      'Some **bold** and _italic_ prose with a [link](https://example.com) and',
      '`inline code`.',
      '',
      '![](photo.png)',
      '',
      '<div class="x">markup</div>',
      '',
      '> a quote',
      '',
      '- a bullet',
    ].join('\n');
    expect(resolveDescription({}, body)).toBe(
      'A heading Some bold and italic prose with a link and inline code. markup a quote a bullet'
    );
  });

  it('drops fenced code blocks rather than inlining them', () => {
    const body = 'Intro line.\n\n```js\nconst x = 1;\n```\n\nOutro line.';
    expect(resolveDescription({}, body)).toBe('Intro line. Outro line.');
  });

  it('truncates at a word boundary with an ellipsis, never mid-word', () => {
    const body = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod';
    const result = resolveDescription({}, body, 20)!;
    expect(result).toBe('lorem ipsum dolor…');
    expect(result.length).toBeLessThanOrEqual(21);
    // The ellipsis never lands inside a word.
    expect(body.split(' ')).toContain(result.replace('…', '').split(' ').pop());
  });

  it('returns short bodies unchanged, with no ellipsis', () => {
    expect(resolveDescription({}, 'Short enough.')).toBe('Short enough.');
  });

  it('returns undefined — not an empty string — for an empty body', () => {
    expect(resolveDescription({}, '')).toBeUndefined();
    expect(resolveDescription({}, '   \n\n  ')).toBeUndefined();
    expect(resolveDescription({}, undefined)).toBeUndefined();
    expect(resolveDescription({})).toBeUndefined();
  });

  it('returns undefined when the body strips down to nothing (image-only card)', () => {
    expect(resolveDescription({}, '![](photo.png)\n')).toBeUndefined();
  });

  it('defaults to EXCERPT_MAX_LENGTH', () => {
    const body = 'word '.repeat(200);
    const result = resolveDescription({}, body)!;
    expect(result.length).toBeLessThanOrEqual(EXCERPT_MAX_LENGTH + 1);
    expect(result.endsWith('…')).toBe(true);
  });
});

describe('stripMarkdown', () => {
  it('collapses whitespace to single spaces', () => {
    expect(stripMarkdown('a\n\n  b\t\tc')).toBe('a b c');
  });

  it('unwraps wikilinks to their label', () => {
    expect(stripMarkdown('see [[target|the label]] here')).toBe('see the label here');
  });

  it('removes Jekyll-era kramdown attribute lists', () => {
    expect(stripMarkdown('see [Web of Flies](http://x){:target="blank"} here')).toBe('see Web of Flies here');
  });

  it('removes table pipes and horizontal rules', () => {
    expect(stripMarkdown('| a | b |\n\n---\n\ntail')).toBe('a b tail');
  });
});

describe('truncateAtWord', () => {
  it('leaves text at exactly the limit untouched', () => {
    const text = 'a'.repeat(10);
    expect(truncateAtWord(text, 10)).toBe(text);
  });

  it('hard-cuts a single word longer than the limit', () => {
    expect(truncateAtWord('a'.repeat(20), 10)).toBe(`${'a'.repeat(10)}…`);
  });

  it('trims trailing punctuation before the ellipsis', () => {
    expect(truncateAtWord('one two, three four', 9)).toBe('one two…');
  });
});
