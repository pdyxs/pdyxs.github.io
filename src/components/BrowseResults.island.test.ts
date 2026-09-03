// The strip layout's anti-FOUC skeleton (issue #123).
//
// The visibility toggles live in global.css and are not loaded here, so what
// this asserts is the half a mounted island owns: that a strip lens renders a
// skeleton at all, that it is tagged for the strip rules, and — the whole
// ruling — that it states NOTHING about the count. The dots and the terminal
// tile are both claims about a number the page does not have yet.
import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount } from 'svelte';
import BrowseResults from './BrowseResults.svelte';
import {
  SKELETON_TILE_COUNT,
  SKELETON_STRIP_TILE_COUNT,
} from '../lib/browse-skeleton';
import type { CardMeta } from '../lib/cards';

function card(uid: string): CardMeta {
  return {
    uid,
    url: `/card/${uid}`,
    title: uid,
    collection: 'what',
    id: uid,
    tags: [],
    renderer: 'card',
    priority: 0,
    sort: { key: 'date', direction: 'desc' },
    visibility: { listed: true, reachable: true },
  } as unknown as CardMeta;
}

let target: HTMLElement | null = null;
let app: Record<string, unknown> | null = null;

function render(props: Record<string, unknown>) {
  target = document.createElement('div');
  document.body.appendChild(target);
  // `as any`: the .astro client-directive prop shim widens the component type
  // past what mount() accepts — same cast as CardStack.island.test.ts.
  app = mount(BrowseResults as any, { target, props }) as Record<string, unknown>;
  return target;
}

afterEach(() => {
  if (app) unmount(app as any);
  target?.remove();
  app = null;
  target = null;
});

describe('BrowseResults strip skeleton', () => {
  const cards = [card('a'), card('b'), card('c')];
  const terminal = { label: 'See all 268 →', uid: 'lens/interesting', params: '' };

  it('renders a skeleton tagged for the strip guard rules', () => {
    const el = render({ cards, layout: 'strip', totalCount: 268, terminal });
    const skeleton = el.querySelector('.fp-skeleton');
    expect(skeleton).not.toBeNull();
    expect(skeleton!.classList.contains('fp-skeleton--strip')).toBe(true);
    expect(skeleton!.classList.contains('fp-skeleton--grid')).toBe(false);
    expect(skeleton!.querySelectorAll('.fp-skeleton-card')).toHaveLength(
      SKELETON_STRIP_TILE_COUNT,
    );
  });

  it('makes no claim about the count: no dot track, no terminal tile', () => {
    const el = render({ cards, layout: 'strip', totalCount: 268, terminal });
    const skeleton = el.querySelector('.fp-skeleton')!;
    expect(skeleton.querySelector('.card-strip-dot')).toBeNull();
    expect(skeleton.querySelector('.card-strip-terminal')).toBeNull();
    expect(skeleton.querySelector('.card-strip-bar')).toBeNull();
    // ...and nothing inside it says a number at all. The live strip beside it
    // does — that one is what the CSS guard hides.
    expect(skeleton.textContent).not.toMatch(/\d/);
  });

  it('still renders the real strip beside it, for the guard to hide', () => {
    const el = render({ cards, layout: 'strip', totalCount: 268, terminal });
    expect(el.querySelector('.card-strip')).not.toBeNull();
    expect(el.querySelector('.card-strip-terminal-button')?.textContent).toBe(
      'See all 268 →',
    );
  });

  it('keeps the grid skeleton unchanged (issue #119)', () => {
    const el = render({ cards, layout: 'grid' });
    const skeleton = el.querySelector('.fp-skeleton')!;
    expect(skeleton.classList.contains('fp-skeleton--grid')).toBe(true);
    expect(skeleton.querySelectorAll('.fp-skeleton-card')).toHaveLength(
      SKELETON_TILE_COUNT,
    );
  });

  it('carries the stalled explanation in both layouts', () => {
    for (const layout of ['grid', 'strip'] as const) {
      const el = render({ cards, layout });
      expect(el.querySelector('.fp-skeleton-stalled')).not.toBeNull();
      expect(el.querySelector('.fp-skeleton-note')).not.toBeNull();
      if (app) unmount(app as any);
      target?.remove();
      app = null;
      target = null;
    }
  });
});
