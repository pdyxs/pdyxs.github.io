// The extracted results placeholder (issue #149, slice 4 of the shared card
// pool).
//
// The visibility toggles live in global.css and are not loaded here, so what
// this asserts is the half a mounted island owns: the class names the
// data-stack-resizing rules name, the tile counts, and the two new states —
// a failure that says which failure it was, and a retry control that calls
// back.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import BrowseSkeleton from './BrowseSkeleton.svelte';
import {
  SKELETON_TILE_COUNT,
  SKELETON_STRIP_TILE_COUNT,
  poolFailureMessage,
} from '../lib/browse-skeleton';

let target: HTMLElement | null = null;
let app: Record<string, unknown> | null = null;

function render(props: Record<string, unknown> = {}) {
  target = document.createElement('div');
  document.body.appendChild(target);
  // `as any`: the .astro client-directive prop shim widens the component type
  // past what mount() accepts — same cast as CardStack.island.test.ts.
  app = mount(BrowseSkeleton as any, { target, props }) as Record<string, unknown>;
  return target;
}

afterEach(() => {
  if (app) unmount(app as any);
  target?.remove();
  app = null;
  target = null;
});

describe('BrowseSkeleton pending state', () => {
  it('keeps the class names the data-stack-resizing rules name', () => {
    const el = render({ layout: 'grid' });
    const skeleton = el.querySelector('.fp-skeleton')!;
    expect(skeleton.classList.contains('fp-skeleton--grid')).toBe(true);
    expect(skeleton.querySelector('.fp-skeleton-note')).not.toBeNull();
    expect(skeleton.querySelector('.fp-skeleton-stalled')).not.toBeNull();
    expect(skeleton.querySelector('.fp-skeleton-list')).not.toBeNull();
    expect(skeleton.querySelectorAll('.fp-skeleton-card')).toHaveLength(
      SKELETON_TILE_COUNT,
    );
  });

  it('tags the strip variant and draws its own tile count', () => {
    const el = render({ layout: 'strip' });
    const skeleton = el.querySelector('.fp-skeleton')!;
    expect(skeleton.classList.contains('fp-skeleton--strip')).toBe(true);
    expect(skeleton.classList.contains('fp-skeleton--grid')).toBe(false);
    expect(skeleton.querySelectorAll('.fp-skeleton-card')).toHaveLength(
      SKELETON_STRIP_TILE_COUNT,
    );
  });

  it('defaults to the grid, so a caller that forgets gets the common shape', () => {
    const el = render();
    expect(el.querySelector('.fp-skeleton--grid')).not.toBeNull();
  });

  it('renders no failure state while it is merely pending', () => {
    const el = render({ layout: 'grid' });
    expect(el.querySelector('.fp-pool-error')).toBeNull();
    expect(el.querySelector('.fp-pool-retry')).toBeNull();
    expect(el.querySelector('.fp-skeleton--failed')).toBeNull();
  });
});

describe('BrowseSkeleton failure state', () => {
  it('states which failure it was and stops promising tiles', () => {
    const el = render({ layout: 'grid', failure: 'timeout' });
    const error = el.querySelector('.fp-pool-error');
    expect(error?.textContent?.trim()).toBe(poolFailureMessage('timeout'));
    // Nothing is coming, so the placeholder row is not drawn.
    expect(el.querySelector('.fp-skeleton-list')).toBeNull();
    expect(el.querySelector('.fp-skeleton-note')).toBeNull();
  });

  it('draws itself rather than waiting for the guard attribute', () => {
    // A failure is island state, not a CSS-guarded pending state: the base
    // .fp-skeleton rule is `display: none`, so the failed box has to turn
    // itself on or nothing would ever show it.
    const el = render({ layout: 'grid', failure: 'network' });
    expect(el.querySelector('.fp-skeleton')!.classList.contains('fp-skeleton--failed'))
      .toBe(true);
  });

  it('offers a retry that calls back', async () => {
    const onRetry = vi.fn();
    const el = render({ layout: 'grid', failure: 'network', onRetry });
    const button = el.querySelector<HTMLButtonElement>('.fp-pool-retry')!;
    expect(button).not.toBeNull();
    button.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omits the retry control when there is nothing to retry with', () => {
    const el = render({ layout: 'grid', failure: 'malformed' });
    expect(el.querySelector('.fp-pool-error')).not.toBeNull();
    expect(el.querySelector('.fp-pool-retry')).toBeNull();
  });
});
