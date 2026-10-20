// How the suspended mark moves. Pure: state and inputs in, next state out — no
// DOM, no clock, no matchMedia (reduced motion is an argument). Shared by the
// /experiments/suspended-dot bench and the production mark, so tuning one
// tunes the other. Where the threads and baubles are drawn is geometry.ts.
//
// Springs are hand-rolled: a damped spring is ten lines, and the target moves
// every frame with the scroll, which is what animation libraries fight.

import type { V } from '@site/mark/geometry';

export type { V };

/** A 1-D damped spring's state: position and velocity. */
export interface Spring {
  x: number;
  v: number;
}

export const REST: Spring = { x: 0, v: 0 };

/** One damped-spring step (unit mass, semi-implicit Euler). zeta < 1 overshoots and settles. */
export function step(s: Spring, target: number, k: number, zeta: number, dt: number): Spring {
  const c = 2 * zeta * Math.sqrt(k);
  const v = s.v + (k * (target - s.x) - c * s.v) * dt;
  return { x: s.x + v * dt, v };
}

/** The integration step every spring here is sub-stepped at, s. Stiff springs blow up at frame-rate steps. */
export const SUBSTEP = 1 / 240;

/** Advance `state` by `dt` in steps of at most `h` (the last one takes the remainder). */
export function subStep<T>(state: T, dt: number, f: (s: T, h: number) => T, h: number = SUBSTEP): T {
  let s = state;
  for (let t = dt; t > 0; t -= h) s = f(s, Math.min(t, h));
  return s;
}

/** `step`, sub-stepped over a whole frame. */
export function springTo(s: Spring, target: number, k: number, zeta: number, dt: number): Spring {
  return subStep(s, dt, (x, h) => step(x, target, k, zeta, h));
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// ── The dot: caught at the top edge, then settling ───────────────────

/** Where the dot stops: its centre on the top edge, so half of it shows. */
export const HANG_Y = 0;
/** The hanging dot's spring stiffness, 1/s². Its damping is the bench's "settle" ζ. */
export const DOT_K = 220;
export const DOT_ZETA = 0.4;
/** The catch's dip: this fraction of the arriving speed, capped (px/s). */
const CATCH_DIP = 0.15;
const CATCH_DIP_MAX = 260;
/** How far (× dot size) taut strings pull the hanging dot down. */
const TAUT_PULL = 0.3;

export interface DotState {
  /** True from the moment the rising title carries the dot to the top edge. */
  stopped: boolean;
  /** The dot centre's y. Its x and size are always the title's. */
  y: Spring;
}

export const DOT_AT_REST: DotState = { stopped: false, y: REST };

export interface DotInput {
  /** The dot slot's centre y, where the title would put the dot. */
  slotY: number;
  /** How fast the slot is moving, px/s (only its speed matters). */
  slotVy: number;
  /** Whether the header has gone (card) or is showing (page). */
  mode: 'page' | 'card';
  /** The dot's current size, px. */
  size: number;
  /** How taut the tool-bearing threads are (`ToolsState.taut.x`). */
  taut: number;
  dt: number;
  reduced: boolean;
  zeta?: number;
  hangY?: number;
}

/** Where the hanging dot rests: pulled a little way down while the strings are taut. */
export function hangTarget(size: number, taut: number, hangY: number = HANG_Y): number {
  return hangY + clamp01(taut) * size * TAUT_PULL;
}

/**
 * The one special thing: carried up with the title, the dot stops at the
 * edge — caught, like a weight at the end of its string — and dips a little
 * before settling. A dip rather than an overshoot: only half the dot is on
 * screen, so any upward bounce would hide it. It lets go once the returning
 * title has come back down past the edge.
 */
export function stepDot(d: DotState, input: DotInput): DotState {
  const { slotY, mode, size, taut, dt, reduced, zeta = DOT_ZETA, hangY = HANG_Y } = input;
  let { stopped, y } = d;
  if (!stopped && mode === 'card' && slotY <= hangY) {
    stopped = true;
    y = { x: hangY, v: reduced ? 0 : Math.min(CATCH_DIP_MAX, Math.abs(input.slotVy) * CATCH_DIP) };
  } else if (stopped && slotY > hangY) {
    stopped = false;
  }
  if (!stopped) return { stopped, y: { x: slotY, v: 0 } };
  if (reduced) return { stopped, y: { x: hangY, v: 0 } };
  return { stopped, y: springTo(y, hangTarget(size, taut, hangY), DOT_K, zeta, dt) };
}

/** True while the dot still has motion worth animating. */
export function dotMoving(d: DotState, size: number, taut: number, hangY: number = HANG_Y): boolean {
  return Math.abs(d.y.v) > 0.02 || (d.stopped && Math.abs(d.y.x - hangTarget(size, taut, hangY)) > 0.05);
}

/**
 * How far below the edge the slot sits when the title has finished leaving:
 * the header rises by its own height, so that is where the slot ends up.
 * The denominator of `poseBlend`.
 */
export function hangSeparation(headerHeight: number, slotY: number, hangY: number = HANG_Y): number {
  return Math.max(1, headerHeight - slotY + hangY);
}

/**
 * How far into the hanging pose the rig is: 0 when the dot stops, 1 once the
 * departing title has reached where it ends up.
 */
export function poseBlend(stopped: boolean, slotY: number, separation: number, hangY: number = HANG_Y): number {
  if (!stopped) return 0;
  return clamp01((hangY - slotY) / separation);
}

// ── Tools: pull, release, rest ───────────────────────────────────────

/**
 * Opening and closing are both a pull on the strings, like a pull trigger:
 * the threads that carry a tool snap taut ('pull'), then relax ('release'),
 * and it is on the release that the tool moves: it falls out when opening and
 * is reeled up when closing. `want` is the state being moved to.
 */
export type Phase = 'rest' | 'pull' | 'release';

export interface ToolsState {
  phase: Phase;
  want: boolean;
  /** Whether the baubles' strings are paid out (set when the release begins). */
  toolsOut: boolean;
  /** How taut the tool-bearing threads are, 0..1 (a spring: they snap, then settle). */
  taut: Spring;
}

export const TOOLS_CLOSED: ToolsState = { phase: 'rest', want: false, toolsOut: false, taut: REST };

/** Pulled this taut, the release begins. */
export const PULLED = 0.96;
const TAUT_K = 500;
const TAUT_ZETA = 0.85;

/**
 * Ask for the tools open or closed. Returns `s` itself when that is already
 * what is wanted, so a caller can tell a real change by identity. With reduced
 * motion there is no pull: the strings are paid out (or not) at once.
 */
export function setWant(s: ToolsState, open: boolean, reduced: boolean): ToolsState {
  if (open === s.want) return s;
  if (reduced) return { ...s, want: open, toolsOut: open, phase: 'rest' };
  return { ...s, want: open, phase: 'pull' };
}

/** One frame of the pull: snap taut, then release (paying out or reeling in), then rest. */
export function stepTools(s: ToolsState, dt: number, reduced: boolean): ToolsState {
  let { phase, toolsOut } = s;
  if (phase === 'pull' && s.taut.x >= PULLED) {
    phase = 'release';
    toolsOut = s.want;
  }
  const taut = reduced ? REST : springTo(s.taut, phase === 'pull' ? 1 : 0, TAUT_K, TAUT_ZETA, dt);
  if (phase === 'release' && Math.abs(taut.x) < 0.002 && Math.abs(taut.v) < 0.02) phase = 'rest';
  return { phase, want: s.want, toolsOut, taut };
}

/** How far to straighten the tool-bearing threads (geometry's `tauten` k). */
export const tautness = (s: ToolsState) => clamp01(s.taut.x);

/**
 * A tool's size, 0..1: it grows out of the letters as it falls and shrinks back
 * as it is reeled up. Critically damped (a size past 1 would pop), and slower
 * going back in.
 */
export function stepToolSize(size: Spring, out: boolean, dt: number, reduced: boolean): Spring {
  if (reduced) return { x: out ? 1 : 0, v: size.v };
  return springTo(size, out ? 1 : 0, out ? 300 : 110, 1, dt);
}

/** Fully reeled up: nothing left to draw. `r` is the string paid out. */
export function toolReeledIn(s: ToolsState, r: number, size: number, dragging: boolean): boolean {
  return !s.toolsOut && s.phase !== 'pull' && !dragging && Math.abs(r) < 1 && size < 0.01;
}

// ── The title's exit: a known trajectory ─────────────────────────────

/**
 * A CSS cubic-bezier timing function (x1, y1, x2, y2), as a function of
 * progress 0..1. x(t) is solved by Newton's method, falling back to bisection
 * where the slope is too flat to trust.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dsx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const solve = (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sx(t) - x;
      if (Math.abs(err) < 1e-7) return t;
      const d = dsx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0, hi = 1;
    t = x;
    while (hi - lo > 1e-7) {
      if (sx(t) < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };
  return (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : sy(solve(x)));
}

/** How long the header takes to leave (and to come back), ms. */
export const TITLE_EXIT_MS = 420;
/** How much the title has grown once it has left: the dot's hanging size, × its size in the title. */
export const TITLE_EXIT_SCALE = 3;
/** Leaving accelerates away; returning arrives fast and eases in to rest. */
export const EASE_LEAVE = cubicBezier(0.5, 0, 0.75, 0);
export const EASE_RETURN = cubicBezier(0.25, 1, 0.5, 1);

export interface TitleStart {
  /** The dot slot's centre, viewport coords, with the header at rest. */
  slot: V;
  /** The title box's top-left, viewport coords: the slot relative to it is the transform-origin. */
  titleOrigin: V;
  /** The header's height, rounded up: it leaves by exactly this much. */
  headerHeight: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface TitleExitOptions {
  /** 'leave' runs page → card; 'return' runs card → page, ending at the start. */
  direction?: 'leave' | 'return';
  scale?: number;
  duration?: number;
}

export interface TitleFrame {
  /** 0 = at rest in the page, 1 = fully left. */
  progress: number;
  title: {
    /** The slot's centre, viewport coords. The title grows about it, so this is also where the dot is. */
    slot: V;
    /** How far the title has moved from its start. */
    offset: V;
    scale: number;
  };
  /** The subtitle rises and drifts with the title but doesn't grow. */
  subtitle: { offset: V };
}

/**
 * The header's departure as a function of time, `t` ms since it began. It
 * rises by its own height and drifts so the slot lands on the centre line;
 * the title grows about the slot, so the dot stays put within it and that
 * growth is what brings the dot to its hanging size.
 */
export function titleExit(start: TitleStart, viewport: Viewport, t: number, opts: TitleExitOptions = {}): TitleFrame {
  const { direction = 'leave', scale = TITLE_EXIT_SCALE, duration = TITLE_EXIT_MS } = opts;
  const x = clamp01(t / duration);
  const progress = direction === 'leave' ? EASE_LEAVE(x) : 1 - EASE_RETURN(x);
  const offset = {
    x: (viewport.width / 2 - start.slot.x) * progress,
    y: 0 - start.headerHeight * progress, // not `-h * p`, which is -0 at rest
  };
  return {
    progress,
    title: {
      slot: { x: start.slot.x + offset.x, y: start.slot.y + offset.y },
      offset,
      scale: 1 + (scale - 1) * progress,
    },
    subtitle: { offset: { ...offset } },
  };
}

/** A WAAPI keyframe, as `Element.animate` takes it (a type, not an interface, so it is assignable to `Keyframe`). */
export type MotionKeyframe = {
  offset: number;
  transform: string;
  transformOrigin?: string;
  easing: 'linear';
};

/**
 * `titleExit` sampled into WAAPI keyframes, evenly in time and linear between
 * samples, for the title and subtitle snapshots. The title's transform-origin
 * is the slot, relative to its own box, so its scale leaves the dot in place.
 */
export function titleExitKeyframes(
  start: TitleStart,
  viewport: Viewport,
  opts: TitleExitOptions & { samples?: number } = {},
): { title: MotionKeyframe[]; subtitle: MotionKeyframe[] } {
  const { samples = 24, duration = TITLE_EXIT_MS } = opts;
  const n = Math.max(2, Math.round(samples));
  const px = (v: number) => `${+v.toFixed(2)}px`;
  const origin = `${px(start.slot.x - start.titleOrigin.x)} ${px(start.slot.y - start.titleOrigin.y)}`;
  const title: MotionKeyframe[] = [];
  const subtitle: MotionKeyframe[] = [];
  for (let i = 0; i < n; i++) {
    const offset = i / (n - 1);
    const f = titleExit(start, viewport, offset * duration, opts);
    const o = f.title.offset;
    title.push({
      offset,
      transform: `translate(${px(o.x)}, ${px(o.y)}) scale(${+f.title.scale.toFixed(4)})`,
      transformOrigin: origin,
      easing: 'linear',
    });
    const so = f.subtitle.offset;
    subtitle.push({ offset, transform: `translate(${px(so.x)}, ${px(so.y)})`, easing: 'linear' });
  }
  return { title, subtitle };
}
