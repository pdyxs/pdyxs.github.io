import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import PuzzleRenderer from './PuzzleRenderer.astro';
import { fakePuzzleEntry } from '../../test/fixtures';

async function render(props: object) {
  const c = await AstroContainer.create();
  return c.renderToString(PuzzleRenderer, { props: props as never });
}

function dom(html: string) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

describe('PuzzleRenderer', () => {
  it('returns nothing when entry is undefined', async () => {
    const div = dom(await render({ entry: undefined, Content: undefined }));
    expect(div.textContent?.trim()).toBe('');
  });

  it('play link uses sudokupad_url when present', async () => {
    const div = dom(await render({
      entry: fakePuzzleEntry({ sudokupad_url: 'https://sudokupad.app/puzzle', url: 'https://lmd.de/puzzle' }),
      Content: undefined,
    }));
    const playLink = div.querySelector('.puzzle-play-link') as HTMLAnchorElement | null;
    expect(playLink?.href).toBe('https://sudokupad.app/puzzle');
  });

  it('play link falls back to url when no sudokupad_url', async () => {
    const div = dom(await render({
      entry: fakePuzzleEntry({ url: 'https://lmd.de/puzzle' }),
      Content: undefined,
    }));
    const playLink = div.querySelector('.puzzle-play-link') as HTMLAnchorElement | null;
    expect(playLink?.href).toBe('https://lmd.de/puzzle');
  });

  it('LMD link appears when sudokupad_url is set', async () => {
    const div = dom(await render({
      entry: fakePuzzleEntry({ sudokupad_url: 'https://sudokupad.app/puzzle' }),
      Content: undefined,
    }));
    expect(div.querySelector('.puzzle-lmd-link')).not.toBeNull();
  });

  it('LMD link absent when sudokupad_url not set', async () => {
    const div = dom(await render({
      entry: fakePuzzleEntry(),
      Content: undefined,
    }));
    expect(div.querySelector('.puzzle-lmd-link')).toBeNull();
  });

  it('remote image renders as a plain img fallback', async () => {
    const div = dom(await render({
      entry: fakePuzzleEntry({ image: 'https://example.com/puzzle.png', title: 'My Puzzle' }),
      Content: undefined,
    }));
    const img = div.querySelector('img') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://example.com/puzzle.png');
    expect(img?.alt).toBe('Preview of My Puzzle');
  });

  it('image absent when data.image not set', async () => {
    const div = dom(await render({ entry: fakePuzzleEntry(), Content: undefined }));
    expect(div.querySelector('img')).toBeNull();
  });

  it('puzzle_type row present when set', async () => {
    const div = dom(await render({
      entry: fakePuzzleEntry({ puzzle_type: 'Sudoku' }),
      Content: undefined,
    }));
    const dts = Array.from(div.querySelectorAll('dt'));
    expect(dts.some(dt => dt.textContent === 'Type')).toBe(true);
  });

  it('puzzle_type row absent when not set', async () => {
    const div = dom(await render({ entry: fakePuzzleEntry(), Content: undefined }));
    const dts = Array.from(div.querySelectorAll('dt'));
    expect(dts.some(dt => dt.textContent === 'Type')).toBe(false);
  });
});
