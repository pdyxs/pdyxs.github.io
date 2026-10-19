import { describe, it, expect } from 'vitest';
import {
  step,
  springTo,
  subStep,
  SUBSTEP,
  REST,
  HANG_Y,
  DOT_AT_REST,
  stepDot,
  dotMoving,
  hangTarget,
  hangSeparation,
  poseBlend,
  TOOLS_CLOSED,
  PULLED,
  setWant,
  stepTools,
  tautness,
  stepToolSize,
  toolReeledIn,
  cubicBezier,
  EASE_LEAVE,
  EASE_RETURN,
  TITLE_EXIT_MS,
  TITLE_EXIT_SCALE,
  titleExit,
  titleExitKeyframes,
  type DotInput,
  type DotState,
  type Spring,
  type ToolsState,
} from '@site/mark/motion';

const FRAME = 1 / 60;

describe('spring', () => {
  it('converges on its target', () => {
    let s: Spring = REST;
    for (let i = 0; i < 300; i++) s = springTo(s, 10, 220, 0.4, FRAME);
    expect(s.x).toBeCloseTo(10, 3);
    expect(Math.abs(s.v)).toBeLessThan(1e-3);
  });

  it('under-damped overshoots; critically damped does not', () => {
    let under: Spring = REST;
    let crit: Spring = REST;
    let maxUnder = 0;
    let maxCrit = 0;
    for (let i = 0; i < 120; i++) {
      under = springTo(under, 1, 300, 0.3, FRAME);
      crit = springTo(crit, 1, 300, 1, FRAME);
      maxUnder = Math.max(maxUnder, under.x);
      maxCrit = Math.max(maxCrit, crit.x);
    }
    expect(maxUnder).toBeGreaterThan(1.05);
    expect(maxCrit).toBeLessThanOrEqual(1.0001);
  });

  it('is pure: step returns a new state and leaves its input alone', () => {
    const s = { x: 0, v: 0 };
    const n = step(s, 1, 100, 1, 0.01);
    expect(s).toEqual({ x: 0, v: 0 });
    expect(n.x).toBeGreaterThan(0);
  });

  it('subStep covers dt exactly, in steps no larger than SUBSTEP', () => {
    const hs: number[] = [];
    subStep(0, 0.02, (s, h) => (hs.push(h), s));
    expect(hs.every((h) => h <= SUBSTEP + 1e-12)).toBe(true);
    expect(hs.reduce((a, b) => a + b, 0)).toBeCloseTo(0.02, 12);
  });
});

describe('the dot: catch at the edge, settle, let go', () => {
  const base: DotInput = { slotY: 40, slotVy: 0, mode: 'page', size: 20, taut: 0, dt: FRAME, reduced: false };

  it('follows the slot while not stopped', () => {
    const d = stepDot(DOT_AT_REST, { ...base, slotY: 37 });
    expect(d).toEqual({ stopped: false, y: { x: 37, v: 0 } });
  });

  it('never catches in page mode, even above the edge', () => {
    const d = stepDot(DOT_AT_REST, { ...base, slotY: -30 });
    expect(d.stopped).toBe(false);
    expect(d.y.x).toBe(-30);
  });

  it('catches when the slot crosses the edge in card mode, with a downward dip', () => {
    const d = stepDot(DOT_AT_REST, { ...base, mode: 'card', slotY: -5, slotVy: -1200 });
    expect(d.stopped).toBe(true);
    expect(d.y.v).toBeGreaterThan(0); // a dip, never an upward bounce
    expect(d.y.x).toBeGreaterThan(HANG_Y);
  });

  it('caps the dip', () => {
    const slow = stepDot(DOT_AT_REST, { ...base, mode: 'card', slotY: -5, slotVy: -100, dt: 0 });
    const fast = stepDot(DOT_AT_REST, { ...base, mode: 'card', slotY: -5, slotVy: -1e6, dt: 0 });
    expect(slow.y.v).toBeCloseTo(15);
    expect(fast.y.v).toBe(260);
  });

  it('settles at the hang target, and stays caught as the title keeps leaving', () => {
    let d: DotState = DOT_AT_REST;
    for (let i = 0; i < 300; i++) d = stepDot(d, { ...base, mode: 'card', slotY: -5 - i, slotVy: -600 });
    expect(d.stopped).toBe(true);
    expect(d.y.x).toBeCloseTo(HANG_Y, 2);
    expect(dotMoving(d, base.size, 0)).toBe(false);
  });

  it('taut strings pull the hanging dot down by 0.3 of its size', () => {
    expect(hangTarget(20, 1)).toBeCloseTo(6);
    expect(hangTarget(20, 2)).toBeCloseTo(6); // clamped
    let d: DotState = { stopped: true, y: { x: 0, v: 0 } };
    for (let i = 0; i < 300; i++) d = stepDot(d, { ...base, mode: 'card', slotY: -50, taut: 1 });
    expect(d.y.x).toBeCloseTo(6, 2);
  });

  it('lets go when the returning title comes back below the edge', () => {
    const caught: DotState = { stopped: true, y: { x: 0, v: 0 } };
    const d = stepDot(caught, { ...base, mode: 'page', slotY: 3 });
    expect(d).toEqual({ stopped: false, y: { x: 3, v: 0 } });
  });

  it('reduced motion: caught dead on the edge, no dip, no settle', () => {
    const d = stepDot(DOT_AT_REST, { ...base, mode: 'card', slotY: -5, slotVy: -1200, reduced: true, taut: 1 });
    expect(d).toEqual({ stopped: true, y: { x: HANG_Y, v: 0 } });
  });

  it('dotMoving sees an unsettled hanging dot', () => {
    expect(dotMoving({ stopped: true, y: { x: 3, v: 0 } }, 20, 0)).toBe(true);
    expect(dotMoving({ stopped: false, y: { x: 3, v: 0 } }, 20, 0)).toBe(false);
  });
});

describe('poseBlend', () => {
  it('is 0 until the dot stops, then runs 0 → 1 as the title leaves', () => {
    const sep = hangSeparation(200, 80); // slot ends 120px above the edge
    expect(sep).toBe(120);
    expect(poseBlend(false, -60, sep)).toBe(0);
    expect(poseBlend(true, 0, sep)).toBe(0);
    expect(poseBlend(true, -60, sep)).toBeCloseTo(0.5);
    expect(poseBlend(true, -120, sep)).toBe(1);
    expect(poseBlend(true, -500, sep)).toBe(1);
  });

  it('separation never falls below 1px', () => {
    expect(hangSeparation(10, 50)).toBe(1);
  });
});

describe('tools: pull → release → rest', () => {
  const run = (s: ToolsState, frames: number, reduced = false, seen?: ToolsState[]) => {
    for (let i = 0; i < frames; i++) {
      s = stepTools(s, FRAME, reduced);
      seen?.push(s);
    }
    return s;
  };

  it('setWant returns the same state when nothing changes', () => {
    expect(setWant(TOOLS_CLOSED, false, false)).toBe(TOOLS_CLOSED);
  });

  it('opening pulls, toolsOut flips at the release, then rests', () => {
    let s = setWant(TOOLS_CLOSED, true, false);
    expect(s.phase).toBe('pull');
    expect(s.toolsOut).toBe(false);
    const seen: ToolsState[] = [];
    s = run(s, 240, false, seen);
    const firstRelease = seen.findIndex((x) => x.phase === 'release');
    expect(firstRelease).toBeGreaterThan(0);
    // Not out during the pull; out from the frame the release begins.
    expect(seen.slice(0, firstRelease).every((x) => !x.toolsOut && x.phase === 'pull')).toBe(true);
    expect(seen[firstRelease].toolsOut).toBe(true);
    expect(seen[firstRelease - 1].taut.x).toBeGreaterThanOrEqual(PULLED);
    expect(s.phase).toBe('rest');
    expect(s.toolsOut).toBe(true);
    expect(tautness(s)).toBeLessThan(0.01);
  });

  it('closing pulls again, and reels in on the release', () => {
    let s = run(setWant(TOOLS_CLOSED, true, false), 240);
    s = setWant(s, false, false);
    expect(s.phase).toBe('pull');
    expect(s.toolsOut).toBe(true); // still out until the release
    s = run(s, 240);
    expect(s).toMatchObject({ phase: 'rest', want: false, toolsOut: false });
  });

  it('the strings go taut during the pull', () => {
    const seen: ToolsState[] = [];
    run(setWant(TOOLS_CLOSED, true, false), 240, false, seen);
    expect(Math.max(...seen.map(tautness))).toBeGreaterThanOrEqual(PULLED);
  });

  it('reduced motion: no pull, paid out at once, strings never taut', () => {
    let s = setWant(TOOLS_CLOSED, true, true);
    expect(s).toMatchObject({ phase: 'rest', want: true, toolsOut: true });
    s = stepTools(s, FRAME, true);
    expect(s.taut).toEqual(REST);
    expect(setWant(s, false, true)).toMatchObject({ phase: 'rest', toolsOut: false });
  });

  it('tool size grows to 1 out, 0 in; reduced motion snaps', () => {
    let size: Spring = REST;
    for (let i = 0; i < 120; i++) size = stepToolSize(size, true, FRAME, false);
    expect(size.x).toBeCloseTo(1, 2);
    expect(size.x).toBeLessThanOrEqual(1.0001); // critically damped: never pops past 1
    expect(stepToolSize({ x: 0.3, v: 0 }, false, FRAME, true).x).toBe(0);
  });

  it('toolReeledIn only once everything is back in and not mid-pull', () => {
    const rest = TOOLS_CLOSED;
    expect(toolReeledIn(rest, 0.5, 0.001, false)).toBe(true);
    expect(toolReeledIn(rest, 5, 0.001, false)).toBe(false);
    expect(toolReeledIn(rest, 0.5, 0.5, false)).toBe(false);
    expect(toolReeledIn(rest, 0.5, 0.001, true)).toBe(false);
    expect(toolReeledIn({ ...rest, phase: 'pull' }, 0, 0, false)).toBe(false);
    expect(toolReeledIn({ ...rest, toolsOut: true }, 0, 0, false)).toBe(false);
  });
});

describe('cubicBezier', () => {
  it('hits its endpoints and matches linear for a linear curve', () => {
    const lin = cubicBezier(0.25, 0.25, 0.75, 0.75);
    for (const x of [0, 0.1, 0.5, 0.9, 1]) expect(lin(x)).toBeCloseTo(x, 5);
    expect(EASE_LEAVE(0)).toBe(0);
    expect(EASE_LEAVE(1)).toBe(1);
  });

  it('matches the standard `ease` curve at a known point', () => {
    // cubic-bezier(0.25, 0.1, 0.25, 1) at 0.5 ≈ 0.8024 (browser reference).
    expect(cubicBezier(0.25, 0.1, 0.25, 1)(0.5)).toBeCloseTo(0.8024, 3);
  });

  it('both exit easings are monotonic; leaving starts slow, returning starts fast', () => {
    for (const ease of [EASE_LEAVE, EASE_RETURN]) {
      let prev = -Infinity;
      for (let i = 0; i <= 200; i++) {
        const y = ease(i / 200);
        expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = y;
      }
    }
    expect(EASE_LEAVE(0.25)).toBeLessThan(0.25);
    expect(EASE_RETURN(0.25)).toBeGreaterThan(0.25);
  });
});

describe('titleExit', () => {
  const start = { slot: { x: 300, y: 80 }, titleOrigin: { x: 40, y: 50 }, headerHeight: 200 };
  const viewport = { width: 1000, height: 800 };

  it('t = 0 is the start', () => {
    const f = titleExit(start, viewport, 0);
    expect(f.progress).toBe(0);
    expect(f.title.slot).toEqual(start.slot);
    expect(f.title.scale).toBe(1);
    expect(f.subtitle.offset).toEqual({ x: 0, y: 0 });
  });

  it('at the end the slot is on the centre line, risen by the header height, at full scale', () => {
    const f = titleExit(start, viewport, TITLE_EXIT_MS);
    expect(f.progress).toBe(1);
    expect(f.title.slot).toEqual({ x: 500, y: 80 - 200 });
    expect(f.title.scale).toBe(TITLE_EXIT_SCALE);
    expect(f.subtitle.offset).toEqual({ x: 200, y: -200 });
    // Past the end it holds.
    expect(titleExit(start, viewport, TITLE_EXIT_MS * 2).title.slot).toEqual(f.title.slot);
  });

  it('the subtitle moves with the title but the scale is the title’s alone', () => {
    const f = titleExit(start, viewport, 300, { scale: 2 });
    expect(f.subtitle.offset).toEqual(f.title.offset);
    expect(f.title.scale).toBeCloseTo(1 + f.progress);
  });

  it('leaving follows EASE_LEAVE; returning runs from the end back to the start on EASE_RETURN', () => {
    expect(titleExit(start, viewport, 210).progress).toBeCloseTo(EASE_LEAVE(0.5));
    const back0 = titleExit(start, viewport, 0, { direction: 'return' });
    const back1 = titleExit(start, viewport, TITLE_EXIT_MS, { direction: 'return' });
    expect(back0.title.slot).toEqual({ x: 500, y: -120 });
    expect(back1.title.slot).toEqual(start.slot);
    expect(titleExit(start, viewport, 105, { direction: 'return' }).progress).toBeCloseTo(1 - EASE_RETURN(0.25));
  });
});

describe('titleExitKeyframes', () => {
  const start = { slot: { x: 300, y: 80 }, titleOrigin: { x: 40, y: 50 }, headerHeight: 200 };
  const viewport = { width: 1000, height: 800 };

  it('samples evenly from offset 0 to 1, linear between, with the slot as the title’s origin', () => {
    const { title, subtitle } = titleExitKeyframes(start, viewport, { samples: 5 });
    expect(title.map((k) => k.offset)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(subtitle).toHaveLength(5);
    expect(title.every((k) => k.easing === 'linear' && k.transformOrigin === '260px 30px')).toBe(true);
    expect(subtitle.every((k) => k.transformOrigin === undefined)).toBe(true);
    expect(title[0].transform).toBe('translate(0px, 0px) scale(1)');
    expect(title[4].transform).toBe('translate(200px, -200px) scale(3)');
    expect(subtitle[4].transform).toBe('translate(200px, -200px)');
  });

  it('return keyframes run from the end state to the start', () => {
    const { title } = titleExitKeyframes(start, viewport, { direction: 'return', samples: 3 });
    expect(title[0].transform).toBe('translate(200px, -200px) scale(3)');
    expect(title[2].transform).toBe('translate(0px, 0px) scale(1)');
  });

  it('never samples fewer than two keyframes', () => {
    expect(titleExitKeyframes(start, viewport, { samples: 1 }).title).toHaveLength(2);
  });
});
