import { describe, it, expect } from 'vitest';
import { resolveActions } from './card-actions';

describe('resolveActions', () => {
  it('returns nothing for undefined data', () => {
    expect(resolveActions(undefined)).toEqual([]);
  });

  it('returns nothing when a card has no actions and no puzzle URLs', () => {
    expect(resolveActions({ actions: [] })).toEqual([]);
  });

  it('passes authored actions through in order', () => {
    expect(
      resolveActions({
        actions: [
          { text: 'Play it', url: 'https://example.com/play' },
          { text: 'Read more', url: 'https://example.com/read' },
        ],
      })
    ).toEqual([
      { text: 'Play it', url: 'https://example.com/play' },
      { text: 'Read more', url: 'https://example.com/read' },
    ]);
  });

  it('drops actions missing a label or a destination', () => {
    expect(
      resolveActions({
        actions: [
          { text: '', url: 'https://example.com' },
          { text: 'No link', url: '' },
          { text: 'Good', url: 'https://example.com/ok' },
        ],
      })
    ).toEqual([{ text: 'Good', url: 'https://example.com/ok' }]);
  });

  it('leads with the SudokuPad play link and follows with the LMD page', () => {
    expect(
      resolveActions({
        sudokupad_url: 'https://sudokupad.app/pdyxs/cartography',
        url: 'https://logic-masters.de/x?id=000LRL',
      })
    ).toEqual([
      { text: 'Play', url: 'https://sudokupad.app/pdyxs/cartography', kind: 'play' },
      { text: 'LMD', url: 'https://logic-masters.de/x?id=000LRL', kind: 'site' },
    ]);
  });

  it('does not list the LMD page twice when it is also the play link', () => {
    expect(resolveActions({ url: 'https://logic-masters.de/x?id=000LRL' })).toEqual([
      { text: 'Play', url: 'https://logic-masters.de/x?id=000LRL', kind: 'play' },
    ]);
  });

  it('orders play link, authored actions, then source page', () => {
    expect(
      resolveActions({
        sudokupad_url: 'https://sudokupad.app/pdyxs/x',
        url: 'https://logic-masters.de/x?id=000LRL',
        actions: [{ text: 'Solution video', url: 'https://youtube.com/watch?v=x' }],
      }).map(a => a.text)
    ).toEqual(['Play', 'Solution video', 'LMD']);
  });

  it('passes an authored `kind` through, and leaves an unkinded action unkinded', () => {
    expect(
      resolveActions({
        actions: [
          { text: 'Buy a nice copy', url: 'https://ko-fi.com/pdyxs/shop', kind: 'buy' },
          { text: 'Website', url: 'https://example.com' },
        ],
      })
    ).toEqual([
      { text: 'Buy a nice copy', url: 'https://ko-fi.com/pdyxs/shop', kind: 'buy' },
      { text: 'Website', url: 'https://example.com' },
    ]);
  });
});
