import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Issue #115: `overflow: hidden` makes a box a scroll container, which
 * re-parents every `position: sticky` descendant to a box that never scrolls.
 * `.stack-card-body` must clip (the 0fr -> 1fr collapse needs it) without
 * becoming a scroll container, so it uses `overflow: clip`.
 */
const here = dirname(fileURLToPath(import.meta.url));
const stackCss = readFileSync(resolve(here, 'stack.css'), 'utf8');
const filterBar = readFileSync(resolve(here, '../components/filters/FilterBar.svelte'), 'utf8');

function declarations(source: string, selector: string): string {
  const start = source.indexOf(`\n${selector} {`);
  expect(start, `${selector} rule`).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf('}', start));
}

describe('sticky descendants of .stack-card-body (#115)', () => {
  it('clips the body without making it a scroll container', () => {
    const rule = declarations(stackCss, '.stack-card-body');
    expect(rule).toMatch(/overflow:\s*clip/);
    expect(rule).not.toMatch(/overflow:\s*hidden/);
  });

  it('pins the dimension controls below the stuck active header, not at top: 0', () => {
    const rule = declarations(filterBar, '  .fp-dimension-controls');
    expect(rule).toMatch(/top:\s*var\(--card-header-stuck-height,\s*0px\)/);
  });

  it('measures the stuck header (its height is content-driven) and publishes it for that offset', () => {
    expect(filterBar).toContain("setProperty('--card-header-stuck-height'");
    expect(filterBar).toContain('ResizeObserver');
  });
});
