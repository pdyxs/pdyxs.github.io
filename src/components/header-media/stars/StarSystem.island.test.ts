// Client-mount tests for the star-navigation island: a regression net for
// framework upgrades. They drive it the way a visitor does — hover a planet to
// preview the intercept, press and release to fly there, reset — on a fake
// frame clock, so the rAF-driven reveal and travel run deterministically.
//
// The drawing is a set of dithered masks (DitherLayer), so shapes are found in
// the masks' markup; the planets' hit circles are the interactive surface.
// Real layout — the viewBox→px transform, which is 0 wide in happy-dom — needs
// a browser; what's checked here is that the right shapes mount, move and
// clear.
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import StarSystem from '@components/header-media/stars/StarSystem.svelte';

const SHIP_PATH = 'M -1 3 l 0 -2 l 1 -1 l 1 1 l 0 2';

// ── Fake frame clock ────────────────────────────────────────────────────────
let now = 0;
let nextId = 1;
let frames = new Map<number, FrameRequestCallback>();

function advance(ms: number) {
  now += ms;
  const due = [...frames.values()];
  frames = new Map();
  for (const cb of due) cb(now);
  flushSync();
}

/** Run frames until the component stops asking for them. */
function settle(stepMs = 50, maxSteps = 10_000) {
  for (let i = 0; i < maxSteps && frames.size > 0; i++) advance(stepMs);
  if (frames.size > 0) throw new Error('animation never settled');
}

// ── Mount ───────────────────────────────────────────────────────────────────
let target: HTMLElement;
let component: ReturnType<typeof mount> | null;

beforeEach(() => {
  now = 0;
  frames = new Map();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextId++;
    frames.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }

  target = document.createElement('div');
  document.body.appendChild(target);
  // `as any`: the .astro client-directive prop shim widens the component type
  // past what mount() accepts — same cast as CardStack.island.test.ts.
  component = mount(StarSystem as any, { target, props: { entryId: 'what/toys/star-navigation', images: [] } });
  flushSync();
});

afterEach(() => {
  if (component) unmount(component);
  component = null;
  target.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── Queries ─────────────────────────────────────────────────────────────────
const qa = <T extends Element = Element>(sel: string) => [...target.querySelectorAll<T>(sel)];
const hits = () => qa<SVGCircleElement>('.planet-hit');
const layers = () => qa('.layer');
// The real ship is drawn in the last (topmost, level-16) layer; a ghost ship,
// when there is one, sits in the preview layer before it.
const ship = () => qa(`mask path[d="${SHIP_PATH}"]`).at(-1)!.getAttribute('transform');
const routes = () => qa<SVGLineElement>('mask line');
const resetButton = () => target.querySelector<HTMLButtonElement>('.star-reset');
const visitable = () => hits().filter((h) => h.style.cursor === 'pointer');
const unvisitable = () => hits().filter((h) => h.style.cursor !== 'pointer');

function pointer(el: Element, type: string, init: PointerEventInit = {}) {
  el.dispatchEvent(new PointerEvent(type, { pointerType: 'mouse', pointerId: 1, bubbles: !type.endsWith('enter') && !type.endsWith('leave'), ...init }));
  flushSync();
}

const START = 'translate(0 4) rotate(0)';

describe('StarSystem', () => {
  it('draws four planets with hit targets, the ship at its start, and no reset', () => {
    expect(hits()).toHaveLength(4);
    expect(ship()).toBe(`${START} scale(0.05)`);
    expect(resetButton()).toBeNull();
    expect(routes()).toHaveLength(0);
  });

  it('marks some planets reachable from the start and some not', () => {
    // The cursor is the visitor's only cue; both kinds must exist at rest for
    // the tests below to mean anything.
    expect(visitable().length).toBeGreaterThan(0);
    expect(unvisitable().length).toBeGreaterThan(0);
  });

  describe('hover preview', () => {
    it('a reachable planet reveals ghost planets and a route that grows over the preview', () => {
      const before = layers().length;
      pointer(visitable()[0], 'pointerenter');

      // Ghost layer and route layer both mount.
      expect(layers().length).toBe(before + 2);
      expect(routes()).toHaveLength(1);
      const route = routes()[0];
      // The route starts at the ship.
      expect(route.getAttribute('x1')).toBe('0');
      expect(route.getAttribute('y1')).toBe('4');

      advance(250);
      const midX = route.getAttribute('x2');
      const midY = route.getAttribute('y2');
      settle();
      const endX = route.getAttribute('x2');
      const endY = route.getAttribute('y2');
      expect([midX, midY]).not.toEqual([endX, endY]);
      expect([endX, endY]).not.toEqual(['0', '4']);
    });

    it('an unreachable planet reveals ghosts but no route', () => {
      const before = layers().length;
      pointer(unvisitable()[0], 'pointerenter');
      expect(layers().length).toBe(before + 1);
      expect(routes()).toHaveLength(0);
    });

    it('leaving the planet clears the preview and stops the reveal', () => {
      const before = layers().length;
      pointer(visitable()[0], 'pointerenter');
      pointer(visitable()[0], 'pointerleave');
      expect(layers().length).toBe(before);
      expect(routes()).toHaveLength(0);
      expect(frames.size).toBe(0);
    });
  });

  describe('flying', () => {
    function flyTo(hit: Element) {
      pointer(hit, 'pointerenter');
      settle();
      pointer(hit, 'pointerdown', { clientX: 100 });
      pointer(hit, 'pointerup', { clientX: 100 });
    }

    it('press and release on a reachable planet flies the ship there, then offers a reset', () => {
      flyTo(visitable()[0]);
      // Travel is under way: frames are queued and the ship is still at start.
      expect(frames.size).toBe(1);

      advance(100);
      const underway = ship();
      expect(underway).not.toBe(`${START} scale(0.05)`);

      settle();
      const arrived = ship();
      expect(arrived).not.toBe(underway);
      // Arrival clears the preview and the route.
      expect(routes()).toHaveLength(0);
      expect(resetButton()).not.toBeNull();
    });

    it('hovering another planet mid-flight does not start a new preview', () => {
      const [first, ...rest] = visitable().length > 1 ? visitable() : [visitable()[0], ...unvisitable()];
      flyTo(first);
      advance(100);
      const layersInFlight = layers().length;
      pointer(rest[0], 'pointerenter');
      expect(layers().length).toBe(layersInFlight);
    });

    it('a press on an unreachable planet plans nothing', () => {
      const hit = unvisitable()[0];
      pointer(hit, 'pointerenter');
      settle();
      pointer(hit, 'pointerdown', { clientX: 100 });
      pointer(hit, 'pointerup', { clientX: 100 });
      expect(frames.size).toBe(0);
      expect(ship()).toBe(`${START} scale(0.05)`);
    });

    it('a cancelled press does not fly', () => {
      const hit = visitable()[0];
      pointer(hit, 'pointerenter');
      settle();
      pointer(hit, 'pointerdown', { clientX: 100 });
      pointer(hit, 'pointercancel');
      pointer(hit, 'pointerup', { clientX: 100 });
      expect(frames.size).toBe(0);
      expect(ship()).toBe(`${START} scale(0.05)`);
    });

    it('reset puts the ship and the system back to the start', () => {
      const hitsAtStart = hits().map((h) => [h.getAttribute('cx'), h.getAttribute('cy')]);
      flyTo(visitable()[0]);
      settle();
      // Orbit time moved, so the planets did too.
      expect(hits().map((h) => [h.getAttribute('cx'), h.getAttribute('cy')])).not.toEqual(hitsAtStart);

      resetButton()!.click();
      flushSync();
      expect(ship()).toBe(`${START} scale(0.05)`);
      expect(resetButton()).toBeNull();
      expect(hits().map((h) => [h.getAttribute('cx'), h.getAttribute('cy')])).toEqual(hitsAtStart);
    });

    it('reset mid-flight stops the travel', () => {
      flyTo(visitable()[0]);
      advance(100);
      resetButton()!.click();
      flushSync();
      expect(frames.size).toBe(0);
      expect(ship()).toBe(`${START} scale(0.05)`);
    });

    it('unmounting mid-flight cancels the animation frame', () => {
      flyTo(visitable()[0]);
      advance(100);
      unmount(component!);
      component = null;
      expect(frames.size).toBe(0);
    });
  });
});
