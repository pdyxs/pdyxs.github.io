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
import { flightPlan } from '@components/star-nav/sim/flightPlan';

// Wrap the real flightPlan in a spy, so a test can see what it was asked.
vi.mock('@components/star-nav/sim/flightPlan', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@components/star-nav/sim/flightPlan')>();
  return { ...actual, flightPlan: vi.fn(actual.flightPlan) };
});

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

// happy-dom does no layout: the drawing is BOX px wide
const BOX = 300;
const press = (hit: Element, init: PointerEventInit = {}) => pointer(hit, 'pointerdown', { clientX: 100, clientY: 100, ...init });
const moveTo = (hit: Element, dx: number, dy: number, init: PointerEventInit = {}) => pointer(hit, 'pointermove', { clientX: 100 + dx, clientY: 100 + dy, ...init });
const release = (hit: Element) => pointer(hit, 'pointerup', {});

describe('StarSystem', () => {
  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: BOX, height: BOX, x: 0, y: 0, top: 0, left: 0, right: BOX, bottom: BOX, toJSON() {} });
  });

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

  describe('an unreachable planet', () => {
    it('a press on an unreachable planet plans nothing', () => {
      const hit = unvisitable()[0];
      press(hit);
      moveTo(hit, 40, 0);
      release(hit);
      expect(ship()).toBe(`${START} scale(0.05)`);
      expect(routes()).toHaveLength(0);
    });

  });

  describe('tap and drag', () => {
    const encounters = () => qa<SVGPolylineElement>('mask polyline.encounter');
    const stops = () => qa<SVGPolylineElement>('mask polyline.stop');
    const earliest = () => qa<SVGCircleElement>('mask circle.earliest');
    const stopMarkers = () => qa<SVGCircleElement>('mask circle.stop-marker');
    const centre = (c: Element) => [Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))];
    const ghostShips = () => qa(`mask path[d="${SHIP_PATH}"]`).slice(0, -1);

    // Drags need the ship fast enough that planets can be flown past: mount
    // again with the real tuning.
    beforeEach(() => {
      unmount(component!);
      Object.assign(defaultTuning, realTuning);
      component = mount(StarSystem as any, { target, props: { entryId: 'what/toys/star-navigation', images: [] } });
      flushSync();
    });

    /** The approach direction on screen, and the way to its right, once the preview has settled. */
    function axes(hit: Element) {
      pointer(hit, 'pointerenter');
      settle();
      const route = routePoints(routes()[0]);
      pointer(hit, 'pointerleave');
      const [x0, y0] = route[0], [x1, y1] = route.at(-1)!;
      const len = Math.hypot(x1 - x0, y1 - y0);
      const along = { x: (x1 - x0) / len, y: (y1 - y0) / len };
      return { along, right: { x: -along.y, y: along.x } };
    }
    const by = (ax: { x: number; y: number }, k: number) => ({ dx: ax.x * k, dy: ax.y * k });
    const sum = (a: { dx: number; dy: number }, b: { dx: number; dy: number }) => ({ dx: a.dx + b.dx, dy: a.dy + b.dy });

    /** A visitable planet from which a drag makes a valid plan. */
    function plannable() {
      return visitable().find((hit) => {
        const ax = axes(hit);
        press(hit);
        const d = sum(by(ax.right, 30), by(ax.along, 0));
        moveTo(hit, d.dx, d.dy);
        const ok = encounters().length === 1;
        pointer(hit, 'pointercancel');
        return ok;
      })!;
    }

    it('a tap selects the planet and shows its preview, and does not move the ship', () => {
      const hit = visitable()[0];
      const before = layers().length;
      press(hit);
      release(hit);
      expect(ship()).toBe(`${START} scale(0.05)`);
      expect(resetButton()).toBeNull();
      settle();
      // the preview stays up without the pointer being over the planet
      expect(layers().length).toBe(before + 2);
      expect(routes()).toHaveLength(1);
      expect(encounters()).toHaveLength(0);
    });

    it('a touch that wobbles inside the dead zone is still a tap', () => {
      const hit = visitable()[0];
      press(hit, { pointerType: 'touch' });
      moveTo(hit, 4, 4, { pointerType: 'touch' });
      release(hit);
      expect(ship()).toBe(`${START} scale(0.05)`);
      expect(encounters()).toHaveLength(0);
      expect(routes()).toHaveLength(1);
    });

    it('selecting another planet replaces the selection', () => {
      const [a, b] = visitable().length > 1 ? visitable() : [visitable()[0], visitable()[0]];
      press(a); release(a); settle();
      const first = routePoints(routes()[0]).at(-1);
      press(b); release(b); settle();
      expect(routes()).toHaveLength(1);
      if (a !== b) expect(routePoints(routes()[0]).at(-1)).not.toEqual(first);
    });

    it('dragging shows the route, the encounter, the stop with a marker, the reach shape and the earliest choice', () => {
      const hit = plannable();
      const ax = axes(hit);
      press(hit);
      const d = by(ax.right, 30);
      moveTo(hit, d.dx, d.dy);
      expect(routes()).toHaveLength(1);
      expect(encounters()).toHaveLength(1);
      expect(stops()).toHaveLength(1);
      expect(stopMarkers()).toHaveLength(1);
      expect(earliest()).toHaveLength(1);
      expect(ghostShips()).toHaveLength(1);
      // the reach shape is drawn from the after-stop pose, not from the ship
      expect(routePoints(reach()[0])[0]).not.toEqual([0, 4]);
    });

    it('dragging across the approach changes the route; the pass is on the side of the drag', () => {
      const hit = plannable();
      const ax = axes(hit);
      press(hit);
      const r = by(ax.right, 40), l = by(ax.right, -40);
      moveTo(hit, r.dx, r.dy);
      const right = routePoints(routes()[0]).at(-1)!;
      moveTo(hit, l.dx, l.dy);
      const left = routePoints(routes()[0]).at(-1)!;
      const side = (p: number[]) => (p[0] - 0) * ax.right.x + (p[1] - 4) * ax.right.y;
      expect(side(right)).toBeGreaterThan(side(left));
    });

    it('dragging along the approach moves the end of the stop, never before the earliest choice', () => {
      const hit = plannable();
      const ax = axes(hit);
      press(hit);
      const sideways = by(ax.right, 30);
      const fwd = sum(sideways, by(ax.along, 50));
      moveTo(hit, fwd.dx, fwd.dy);
      const forward = encounters()[0].getAttribute('points')!.split(' ').length;
      const back = sum(sideways, by(ax.along, -200));
      moveTo(hit, back.dx, back.dy);
      expect(encounters()[0].getAttribute('points')!.split(' ').length).toBeLessThan(forward);
      // as early as it can go, the choice point is the marked earliest one
      expect(centre(stopMarkers()[0])).toEqual(centre(earliest()[0]));
    });

    it('the frame is fixed at press: the same drag vector gives the same plan however the pointer got there', () => {
      const hit = plannable();
      const ax = axes(hit);
      press(hit);
      const target = sum(by(ax.right, 30), by(ax.along, 10));
      moveTo(hit, target.dx, target.dy);
      const direct = routes()[0].getAttribute('points');
      moveTo(hit, -80, 60);
      moveTo(hit, target.dx, target.dy);
      expect(routes()[0].getAttribute('points')).toBe(direct);
    });

    describe('flying the plan', () => {
      const flyings = () => qa<SVGCircleElement>('mask circle.flight-stop');

      /** Drag a plannable planet and release; returns what was planned. */
      function launch() {
        const hit = plannable();
        const ax = axes(hit);
        press(hit);
        const d = by(ax.right, 30);
        moveTo(hit, d.dx, d.dy);
        const planned = ghostShips()[0].getAttribute('transform');
        const reachStart = routePoints(reach()[0])[0];
        release(hit);
        return { hit, planned, reachStart };
      }

      it('release does not jump: the ship moves in steps and ends at the plan\'s after pose', () => {
        const { planned } = launch();
        expect(ship()).toBe(`${START} scale(0.05)`);
        expect(frames.size).toBe(1);
        expect(encounters()).toHaveLength(0);
        const seen = new Set<string | null>();
        for (let i = 0; i < 10_000 && frames.size > 0; i++) { advance(50); seen.add(ship()); }
        expect(seen.size).toBeGreaterThan(5);
        expect(seen.has(planned)).toBe(true);
        expect(ship()).toBe(planned);
        expect(frames.size).toBe(0);
        expect(resetButton()).not.toBeNull();
      });

      it('moves the planets with the ship, ending at the plan\'s end time', () => {
        launch();
        const planetsAt = () => hits().map((h) => [h.getAttribute('cx'), h.getAttribute('cy')]);
        const start = planetsAt();
        advance(100);
        const mid = planetsAt();
        expect(mid).not.toEqual(start);
        settle();
        expect(planetsAt()).not.toEqual(mid);
        const end = vi.mocked(flightPlan).mock.results.at(-1)!.value.endTime;
        expect(end).toBeGreaterThan(0);
      });

      it('shows a stop indicator only while stopped for an action', () => {
        launch();
        expect(flyings()).toHaveLength(0);
        let during = 0;
        while (frames.size > 0) { advance(20); during += flyings().length; }
        expect(during).toBeGreaterThan(0);
        expect(flyings()).toHaveLength(0);
      });

      it('arrives with the reach shape drawn from the after pose and the selection cleared', () => {
        const { reachStart } = launch();
        settle();
        const arrived = routePoints(reach()[0])[0];
        expect(arrived).toEqual(reachStart);
        expect(routes()).toHaveLength(0);
        expect(layers().length).toBeGreaterThan(0);
      });

      it('cannot start a second drag while flying', () => {
        const { hit } = launch();
        advance(100);
        const before = ship();
        press(hit);
        moveTo(hit, 30, 30);
        expect(encounters()).toHaveLength(0);
        release(hit);
        settle();
        expect(before).not.toBe(`${START} scale(0.05)`);
      });

      it('reset mid-flight stops everything and leaves a clean start', () => {
        launch();
        advance(100);
        resetButton()!.click();
        flushSync();
        expect(frames.size).toBe(0);
        expect(ship()).toBe(`${START} scale(0.05)`);
        expect(resetButton()).toBeNull();
        expect(flyings()).toHaveLength(0);
      });

      it('unmounting mid-flight cancels the animation frame', () => {
        launch();
        advance(100);
        unmount(component!);
        component = null;
        expect(frames.size).toBe(0);
      });

      it('reduced motion flies the same route, faster', () => {
        const count = () => { let n = 0; while (frames.size > 0) { advance(16); n++; } return n; };
        launch();
        const normal = count();
        const normalEnd = ship();
        resetButton()!.click();
        flushSync();
        vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
        window.matchMedia = (globalThis as any).matchMedia;
        launch();
        const reduced = count();
        expect(ship()).toBe(normalEnd);
        expect(reduced).toBeLessThan(normal / 3);
      });
    });

    it('a cancelled drag does not move the ship', () => {
      const hit = plannable();
      const ax = axes(hit);
      press(hit);
      const d = by(ax.right, 30);
      moveTo(hit, d.dx, d.dy);
      pointer(hit, 'pointercancel');
      pointer(hit, 'pointerup', {});
      expect(ship()).toBe(`${START} scale(0.05)`);
      expect(encounters()).toHaveLength(0);
    });

    it('the planet stays pinned: every plan in a gesture is made for the same arrival', () => {
      const hit = plannable();
      const ax = axes(hit);
      vi.mocked(flightPlan).mockClear();
      press(hit);
      for (const k of [10, 25, -30, 45]) {
        const d = by(ax.right, k);
        moveTo(hit, d.dx, d.dy);
      }
      const arrivals = vi.mocked(flightPlan).mock.calls.map(([input]) => input.pinnedArrival);
      expect(arrivals.length).toBeGreaterThan(3);
      expect(new Set(arrivals).size).toBe(1);
    });

    it('reset puts the ship and the system back to the start', () => {
      const hitsAtStart = hits().map((h) => [h.getAttribute('cx'), h.getAttribute('cy')]);
      const hit = plannable();
      const ax = axes(hit);
      press(hit);
      const d = by(ax.right, 30);
      moveTo(hit, d.dx, d.dy);
      release(hit);
      settle();
      // Orbit time moved, so the planets did too.
      expect(hits().map((h) => [h.getAttribute('cx'), h.getAttribute('cy')])).not.toEqual(hitsAtStart);

      resetButton()!.click();
      flushSync();
      expect(ship()).toBe(`${START} scale(0.05)`);
      expect(resetButton()).toBeNull();
      expect(hits().map((h) => [h.getAttribute('cx'), h.getAttribute('cy')])).toEqual(hitsAtStart);
    });

    it('unmounting cancels the reveal animation frame', () => {
      pointer(visitable()[0], 'pointerenter');
      advance(100);
      unmount(component!);
      component = null;
      expect(frames.size).toBe(0);
    });
  });
});
