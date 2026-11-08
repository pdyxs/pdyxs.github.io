import { describe, expect, it } from 'vitest';
import { maskGlyphs, type TitleFont, type TitleWord } from '@site/mark/title-mask';

const font: TitleFont = {
  family: 'Montserrat',
  size: '20px',
  weight: '700',
  style: 'normal',
  letterSpacing: 'normal',
  textTransform: 'none',
  stroke: 6,
};

const word = (text: string, left: number, bottom: number, width = 40): TitleWord => ({
  text,
  left,
  width,
  bottom,
  descent: 5,
  font,
});

describe('maskGlyphs', () => {
  it('puts each word on its baseline, in the overlay’s coordinates', () => {
    const [g] = maskGlyphs([word('Teppanyaki', 120, 90, 110)], { x: 20, y: 10 });
    expect(g).toEqual({ text: 'Teppanyaki', x: 100, y: 75, width: 110, font });
  });

  it('keeps the words of a wrapped title on their own lines', () => {
    const gs = maskGlyphs([word('Gotta', 30, 50), word('Space', 30, 80)], { x: 0, y: 0 });
    expect(gs.map((g) => [g.text, g.y])).toEqual([
      ['Gotta', 45],
      ['Space', 75],
    ]);
  });

  it('drops blank and zero-width words (collapsed or hidden text)', () => {
    expect(maskGlyphs([word(' ', 0, 10), word('x', 0, 10, 0)], { x: 0, y: 0 })).toEqual([]);
  });
});
