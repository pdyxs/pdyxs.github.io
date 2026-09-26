// Client-mount tests for the lino-print canvas: a regression net for framework
// upgrades. They drive the island the way a visitor does — pick a tile, pick
// an exit, pick the next tile, click back to an earlier one, move the mouse —
// and assert the DOM it leaves behind. Layout itself (the CSS the custom
// properties feed) needs a browser; what's checked here is that the right
// tiles, exits and positions reach the markup.
import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LinoCanvas from '@components/header-media/LinoCanvas.svelte';
import type { HeaderMediaImage } from '@render/header-media';

// Five tiles, as the real card has: EXITS in the component is indexed by
// filename-sorted position, so the fixture has to be five long too.
const IMAGES: HeaderMediaImage[] = [1, 2, 3, 4, 5].map((n) => ({
  filename: `lino-${n}.jpg`,
  src: `/img/lino-${n}.jpg`,
  width: 500,
  height: 500,
}));

let target: HTMLElement;
let component: ReturnType<typeof mount>;

beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
  // `as any`: the .astro client-directive prop shim widens the component type
  // past what mount() accepts — same cast as CardStack.island.test.ts.
  component = mount(LinoCanvas as any, { target, props: { entryId: 'what/art/lino-printing', images: IMAGES } });
  flushSync();
});

afterEach(() => {
  unmount(component);
  target.remove();
});

const q = <T extends Element = HTMLElement>(sel: string) => target.querySelector<T>(sel);
const qa = <T extends Element = HTMLElement>(sel: string) => [...target.querySelectorAll<T>(sel)];
const placeables = () => qa('.image-placeable');
const placeableSrcs = () => placeables().map((b) => b.querySelector('img')!.getAttribute('src'));
const placed = () => qa('.image-container');
const exits = () => qa<HTMLButtonElement>('.exit');
const wiggle = () => q('.lino-wiggle')!;

function click(el: Element) {
  (el as HTMLElement).click();
  flushSync();
}

// An exit button on the placed tile showing lino-n.
function exitOf(n: number, label: string): HTMLButtonElement {
  const tile = placed().find((t) => t.querySelector('img')!.getAttribute('src') === `/img/lino-${n}.jpg`);
  const exit = tile?.querySelector<HTMLButtonElement>(`.exit[aria-label="${label}"]`);
  if (!exit) throw new Error(`lino-${n} shows no ${label}`);
  return exit;
}

function placeTile(n: number) {
  const button = placeables().find((b) => b.querySelector('img')!.getAttribute('src') === `/img/lino-${n}.jpg`);
  if (!button) throw new Error(`lino-${n} is not offered for placement`);
  click(button);
}

describe('LinoCanvas', () => {
  it('starts empty, offering every tile for the first placement', () => {
    expect(q('.lino-canvas')!.dataset.entry).toBe('what/art/lino-printing');
    expect(placed()).toHaveLength(0);
    expect(placeableSrcs()).toEqual(IMAGES.map((i) => i.src));
  });

  it('placing the first tile puts it at the origin, focuses it, and shows its open exits', () => {
    placeTile(1);

    expect(placed()).toHaveLength(1);
    const tile = placed()[0];
    expect(tile.style.getPropertyValue('--col')).toBe('0');
    expect(tile.style.getPropertyValue('--row')).toBe('0');
    expect(tile.querySelector('img')!.getAttribute('src')).toBe('/img/lino-1.jpg');
    expect(tile.querySelector('.image-placed')!.classList.contains('current')).toBe(true);

    // The picker closes once a tile is down.
    expect(placeables()).toHaveLength(0);

    // lino-1's exits are [1, 5, 6, 7]; each shows only if some remaining tile
    // has the opposite exit ((exit + 4) % 8) to join it.
    expect(exits().map((e) => e.getAttribute('aria-label'))).toEqual(['Exit 1', 'Exit 5', 'Exit 6', 'Exit 7']);
  });

  it('an exit offers only the tiles that can join it, and places the next one beside it', () => {
    placeTile(1);

    // Exit 1 is the top edge's right half; a joining tile needs exit 5.
    click(exitOf(1, 'Exit 1'));
    expect(placeableSrcs()).toEqual(['/img/lino-2.jpg', '/img/lino-3.jpg', '/img/lino-4.jpg', '/img/lino-5.jpg']);
    // Exits hide while a placement is pending.
    expect(exits()).toHaveLength(0);
    // Focus moves to the empty spot: exit 1 is at [0.25, -0.5], doubled.
    expect(wiggle().style.getPropertyValue('--focusx')).toBe('0.5');
    expect(wiggle().style.getPropertyValue('--focusy')).toBe('-1');

    placeTile(3);
    expect(placed()).toHaveLength(2);
    const second = placed()[1];
    expect(second.querySelector('img')!.getAttribute('src')).toBe('/img/lino-3.jpg');
    expect(second.style.getPropertyValue('--col')).toBe('0.5');
    expect(second.style.getPropertyValue('--row')).toBe('-1');
    expect(second.querySelector('.image-placed')!.classList.contains('current')).toBe(true);
    expect(placed()[0].querySelector('.image-placed')!.classList.contains('current')).toBe(false);
  });

  it('an exit whose opposite no remaining tile has is not offered', () => {
    placeTile(1);
    // Exit 6 is the left edge's lower half; it needs exit 2, which only lino-4
    // (index 3) has.
    click(exitOf(1, 'Exit 6'));
    expect(placeableSrcs()).toEqual(['/img/lino-4.jpg']);
    placeTile(4);

    // With lino-4 placed, no remaining tile has exit 2, so no exit 6 anywhere.
    expect(exits().some((e) => e.getAttribute('aria-label') === 'Exit 6')).toBe(false);
  });

  it('clicking an earlier tile refocuses on it and cancels a pending placement', () => {
    placeTile(1);
    click(exits()[0]);
    expect(placeables().length).toBeGreaterThan(0);

    click(placed()[0].querySelector('.image-placed')!);
    expect(placeables()).toHaveLength(0);
    expect(wiggle().style.getPropertyValue('--focusx')).toBe('0');
    expect(wiggle().style.getPropertyValue('--focusy')).toBe('0');
    expect(exits().length).toBeGreaterThan(0);
  });

  it('once every tile is placed, no exits remain', () => {
    // A path through the exit table that joins all five:
    // 1 →(6) 4 →(1) 2 →(1) 3 →(1) 5.
    placeTile(1);
    click(exitOf(1, 'Exit 6'));
    placeTile(4);
    click(exitOf(4, 'Exit 1'));
    placeTile(2);
    click(exitOf(2, 'Exit 1'));
    placeTile(3);
    click(exitOf(3, 'Exit 1'));
    placeTile(5);

    expect(placed()).toHaveLength(5);
    expect(exits()).toHaveLength(0);
    expect(placeables()).toHaveLength(0);
  });

  describe('wiggle', () => {
    function pointerMove(pointerType: string, clientX: number, clientY: number) {
      const container = q('.container')!;
      container.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON() {} }) as DOMRect;
      container.dispatchEvent(new PointerEvent('pointermove', { pointerType, clientX, clientY, bubbles: true }));
      flushSync();
    }

    it('follows the mouse, as a fraction of the container', () => {
      pointerMove('mouse', 150, 25);
      // -((150/200) - 0.5), -((25/100) - 0.5)
      expect(wiggle().style.getPropertyValue('--dx')).toBe('-0.25');
      expect(wiggle().style.getPropertyValue('--dy')).toBe('0.25');
    });

    it('ignores touch and pen, so a tap does not jolt the canvas', () => {
      pointerMove('touch', 150, 25);
      pointerMove('pen', 10, 90);
      expect(wiggle().style.getPropertyValue('--dx')).toBe('0');
      expect(wiggle().style.getPropertyValue('--dy')).toBe('0');
    });
  });
});
