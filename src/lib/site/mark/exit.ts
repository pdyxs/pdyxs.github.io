// Where the suspended mark draws its dot from, around the title's exit. Pure:
// the mark (SuspendedMark.astro) says what is going on, and this says which
// slot to read and where a title that has gone has gone to.
//
// The dot always hangs from a slot: the point in the title where the full
// stop sits, which the threads are tied around. While the title is on screen
// that slot is real and is read off the page. During a view transition only
// the title's snapshot moves, so the slot is `titleExit` at the snapshot
// animation's own time. After the exit, in card mode, there is no title at all
// and the slot is virtual: `titleExit`'s last frame, which is above the top
// edge, at the viewport's centre line. The dot, caught at the edge, hangs from
// it, so it stays exactly where the exit left it.

import { HANG_Y, TITLE_EXIT_MS, titleExit, type DotState, type TitleFrame, type TitleStart, type Viewport } from '@site/mark/motion';

/**
 * Where the title is once it has left: `titleExit`'s END frame. `viewport` is
 * the current one, so the hang follows a resize back to the centre line. Its
 * y is fixed by `start` alone, so scrolling the card never moves it.
 */
export function hangFrame(start: TitleStart, viewport: Viewport, opts: { scale?: number; duration?: number } = {}): TitleFrame {
  const duration = opts.duration ?? TITLE_EXIT_MS;
  return titleExit(start, viewport, duration, { ...opts, duration, direction: 'leave' });
}

/**
 * The exit's elapsed time, as the snapshot's animation reports it: 0 until
 * there is one (the snapshots don't move before `ready` either), and 0 for a
 * time that isn't a plain number of milliseconds.
 */
export function exitTime(currentTime: unknown): number {
  return typeof currentTime === 'number' && Number.isFinite(currentTime) ? currentTime : 0;
}

/**
 * Where to read the slot:
 *  - `exit`: sampled from `titleExit` (a view transition's snapshots are moving);
 *  - `tracked`: `titleExit`'s offset from the live slot. A return's snapshot is
 *    the NEW element's, and the browser keeps placing it wherever that element
 *    is laid out, so when the stack's own motion is still moving the page card
 *    the snapshot moves with it, and so must the dot. (A leaving snapshot is
 *    the old element's, captured once, so `exit` is exact there.)
 *  - `live`: off the laid-out title, transforms included;
 *  - `hang`: the virtual slot, `hangFrame`;
 *  - `none`: nowhere, so nothing is drawn.
 */
export type SlotSource = 'exit' | 'tracked' | 'live' | 'hang' | 'none';

export interface SlotSourceInput {
  mode: 'page' | 'card';
  /** The exit in flight: over a view transition's snapshots, on the live title, or none. */
  run: 'vt' | 'live' | null;
  /** Which way the run is going. */
  direction?: 'leave' | 'return';
  /** Whether the run's start is known. A return measures it once the new state is laid out. */
  runStart: boolean;
  /** Whether a title has been measured that a card-mode hang can come from. */
  hang: boolean;
  /** Whether a page-mode title slot is laid out. */
  slot: boolean;
}

export function slotSource(s: SlotSourceInput): SlotSource {
  // A return whose new title isn't measured yet is still showing the old
  // state, which is the hang.
  if (s.run === 'vt') {
    if (!s.runStart) return s.hang ? 'hang' : 'none';
    return s.direction === 'return' && s.slot ? 'tracked' : 'exit';
  }
  if (s.run === 'live' || s.mode === 'page') return s.slot ? 'live' : 'none';
  return s.hang ? 'hang' : 'none';
}

/**
 * The dot as a return picks it up: caught at the edge, so it lets go as the
 * title comes back down past it (`stepDot`). One already hanging is left as it
 * is; one that wasn't drawn (a cold card load, which has no hang yet) starts
 * there too, rather than falling in from above the screen.
 */
export function caughtDot(d: DotState, hangY: number = HANG_Y): DotState {
  return d.stopped ? d : { stopped: true, y: { x: hangY, v: 0 } };
}
