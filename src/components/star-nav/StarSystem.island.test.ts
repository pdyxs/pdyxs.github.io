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
import StarSystem from '@components/star-nav/StarSystem.svelte';
import { defaultTuning } from '@components/star-nav/sim/tuning';

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

// With the real tuning every planet is catchable from the start: the planets
// loop round for four orbits and cross the ship's reach sooner or later. A
// sluggish ship (set before mounting, which is when the island reads it)
// leaves the inner planets out of reach, so both kinds exist at rest.
const realTuning = { ...defaultTuning };

beforeEach(() => {
  defaultTuning.shipSpeed = 0.1;
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
  Object.assign(defaultTuning, realTuning);
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
const routes = () => qa<SVGPolylineElement>('mask polyline.route');
const reach = () => qa<SVGPolygonElement>('mask polygon.reach');
const routePoints = (r: Element) => r.getAttribute('points')!.split(' ').map((s) => s.split(',').map(Number));
const resetButton = () => target.querySelector<HTMLButtonElement>('.star-reset');
const visitable = () => hits().filter((h) => h.style.cursor === 'pointer');
const unvisitable = () => hits().filter((h) => h.style.cursor !== 'pointer');

function pointer(el: Element, type: string, init: PointerEventInit = {}) {
  el.dispatchEvent(new PointerEvent(type, { pointerType: 'mouse', pointerId: 1, bubbles: !type.endsWith('enter') && !type.endsWith('leave'), ...init }));
  flushSync();
}

const START = 'translate(0 4) rotate(0)';

// ── Sizing ──────────────────────────────────────────────────────────────────
// The drawing adopts whatever box its container gives it. happy-dom does no
// layout, so a fake box is dropped onto the measured element: `size()` mounts a
// fresh island whose `.dither-svg` reports the given clientWidth/clientHeight.
function mountSized(width: number, height: number) {
  const proto = HTMLElement.prototype;
  const w = Object.getOwnPropertyDescriptor(proto, 'clientWidth');
  const h = Object.getOwnPropertyDescriptor(proto, 'clientHeight');
  Object.defineProperty(proto, 'clientWidth', { configurable: true, get() { return this.classList.contains('dither-svg') ? width : 0; } });
  Object.defineProperty(proto, 'clientHeight', { configurable: true, get() { return this.classList.contains('dither-svg') ? height : 0; } });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const c = mount(StarSystem as any, { target: host, props: { entryId: 'what/toys/star-navigation', images: [] } });
  flushSync();
  const read = () => {
    const mask = host.querySelector('mask')!;
    return {
      maskWidth: Number(mask.getAttribute('width')),
      maskHeight: Number(mask.getAttribute('height')),
      transform: mask.querySelector('g')!.getAttribute('transform'),
    };
  };
  const result = read();
  unmount(c);
  host.remove();
  if (w) Object.defineProperty(proto, 'clientWidth', w); else delete (proto as any).clientWidth;
  if (h) Object.defineProperty(proto, 'clientHeight', h); else delete (proto as any).clientHeight;
  return result;
}

describe('StarSystem sizing', () => {
  it('a square box draws the viewBox across its full width, as before', () => {
    expect(mountSized(300, 300)).toEqual({ maskWidth: 300, maskHeight: 300, transform: 'translate(0 0) scale(30) translate(5 5)' });
  });

  it('a tall box (390x780) is filled by the mask and the system is centred at the width-fitted scale', () => {
    expect(mountSized(390, 780)).toEqual({ maskWidth: 390, maskHeight: 780, transform: 'translate(0 195) scale(39) translate(5 5)' });
  });

  it('a wide box fits to its height, so nothing is cropped either way', () => {
    expect(mountSized(800, 400)).toEqual({ maskWidth: 800, maskHeight: 400, transform: 'translate(200 0) scale(40) translate(5 5)' });
  });
});

describe('StarSystem', () => {
  it('shows the reach shape from the ship at its start: a narrow neck opening out ahead', () => {
    expect(reach()).toHaveLength(1);
    const pts = routePoints(reach()[0]);
    // starts at the ship's nose, and runs off past the top of the viewBox
    expect(pts[0]).toEqual([0, 4]);
    expect(Math.min(...pts.map(([, y]) => y))).toBeLessThan(-5);
    // wider far away than near
    const near = pts.filter(([, y]) => 4 - y < 1);
    expect(Math.max(...near.map(([x]) => Math.abs(x)))).toBeLessThan(0.5);
    expect(Math.max(...pts.map(([x]) => Math.abs(x)))).toBeGreaterThan(5);
  });

  it('draws four planets with hit targets, the ship at its start, and no reset', () => {
    expect(hits()).toHaveLength(4);
    expect(ship()).toBe(`${START} scale(0.05)`);
    expect(resetButton()).toBeNull();
    expect(routes()).toHaveLength(0);
  });

  it('marks some planets visitable from the start and some not (pointer vs default cursor)', () => {
    // The cursor is the visitor's only cue; both kinds must exist at rest for
    // the tests below to mean anything.
    expect(visitable().length).toBeGreaterThan(0);
    expect(unvisitable().length).toBeGreaterThan(0);
  });

  describe('hover preview', () => {
    it('a reachable planet reveals ghost planets and a curved route that grows over the preview', () => {
      const before = layers().length;
      pointer(visitable()[0], 'pointerenter');

      // Ghost layer and route layer both mount.
      expect(layers().length).toBe(before + 2);
      expect(routes()).toHaveLength(1);
      const route = routes()[0];
      // The route starts at the ship.
      expect(routePoints(route)[0]).toEqual([0, 4]);

      advance(250);
      const mid = routePoints(route).at(-1);
      settle();
      const full = routePoints(route);
      expect(full.at(-1)).not.toEqual(mid);
      expect(full.at(-1)).not.toEqual([0, 4]);
    });

    it('a route to an off-axis planet bends: it is not a straight line', () => {
      // Try each visitable planet; at least one needs an arc.
      const bends = visitable().some((hit) => {
        pointer(hit, 'pointerenter');
        settle();
        const pts = routePoints(routes()[0]);
        pointer(hit, 'pointerleave');
        const [x0, y0] = pts[0], [x1, y1] = pts.at(-1)!;
        return pts.some(([x, y]) => Math.abs((x1 - x0) * (y0 - y) - (x0 - x) * (y1 - y0)) / Math.hypot(x1 - x0, y1 - y0) > 0.05);
      });
      expect(bends).toBe(true);
    });

    it('an unreachable planet previews nothing: no ghosts, no route', () => {
      const before = layers().length;
      pointer(unvisitable()[0], 'pointerenter');
      expect(layers().length).toBe(before);
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
      const hit = visitable()[0];
      pointer(hit, 'pointerenter');
      settle();
      const shown = routePoints(routes()[0]);
      const endOfRoute = shown.at(-1)!;
      pointer(hit, 'pointerdown', { clientX: 100 });
      pointer(hit, 'pointerup', { clientX: 100 });
      // Travel is under way: frames are queued and the ship is still at start.
      expect(frames.size).toBe(1);

      advance(100);
      const underway = ship();
      expect(underway).not.toBe(`${START} scale(0.05)`);

      settle();
      const arrived = ship();
      expect(arrived).not.toBe(underway);
      // The ship ends at the end of the route it was shown.
      const [ax, ay] = arrived!.match(/^translate\(([-\d.e]+) ([-\d.e]+)\)/)!.slice(1).map(Number);
      expect(ax).toBeCloseTo(endOfRoute[0], 6);
      expect(ay).toBeCloseTo(endOfRoute[1], 6);
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
