// The suspended mark hanging at the top of the screen, with no title to come
// from. Pure. Used two ways, which is what keeps them the same:
//
//   - at build time, `hangMarkup` lays the pose out once, in em, for the SSR
//     copy SuspendedMark.astro draws before any script runs (a cold load of a
//     card, a deep link, a page with no stack). CSS sizes it by the em.
//   - at run time, `hangPose` is the same pose in px, at the em the browser
//     resolved, for the live overlay: after a cold load and after the title's
//     exit alike.
//
// The single source of the hang's size is `--mark-hang-em` / `--mark-hang-size`
// in src/styles/tokens.css: the page title's font-size (`--page-title-size`)
// times the exit's growth, and the hanging dot is that em times the full stop's
// ink width. The script reads both back as resolved lengths, so it never
// computes them; `TITLE_EXIT_SCALE` (motion.ts) and `HANG_DOT_INK` here are the
// same two factors for the code that needs them as numbers, and hang.test.ts
// pins them to the CSS.
//
// Why the pose needs no title: the rig's hang control points are em offsets
// from the attach points on the dot (src/data/mark-rig.ts), and the threads'
// anchors, on letters that have left the screen, are put `HANG_DEPTH` em above
// the dot. So the whole pose is the dot's centre plus em times fixed numbers.

import type { MarkRig } from '@data/mark-rig';
import { poseThreads, threadPathData, type Pose, type V } from '@site/mark/geometry';
import { HANG_Y, TITLE_EXIT_SCALE, clamp01 } from '@site/mark/motion';

/**
 * The full stop's ink width, em, as the hanging dot is drawn: Saira Stencil's,
 * measured in Chromium (measure.ts's `FALLBACK_DOT_INK`). In the title the dot
 * is sized by the ink the engine actually rasterises; hanging, it is this, so
 * CSS can size it before any script runs.
 */
export const HANG_DOT_INK = 0.095;

/**
 * How far above the hanging dot's centre the letters (the threads' anchors)
 * are, em. The hang pose was authored at this separation, in
 * /experiments/mark-editor ("letters above dot").
 */
export const HANG_DEPTH = 0.6;

/** The hang's two lengths, px: the dot's size and the em its threads are posed in. */
export interface HangMetrics {
  size: number;
  em: number;
}

/** The hang for a dot `size` px across: its em follows from the ink width. */
export function hangMetrics(size: number, ink: number = HANG_DOT_INK): HangMetrics {
  return { size, em: ink > 0 ? size / ink : 0 };
}

/** The hang for a page title `titlePx` px, grown by `scale`. What the CSS tokens resolve to. */
export function hangFromTitle(titlePx: number, scale: number = TITLE_EXIT_SCALE, ink: number = HANG_DOT_INK): HangMetrics {
  const em = titlePx * scale;
  return { size: em * ink, em };
}

/** Where the threads' anchors hang from: `HANG_DEPTH` em above the top edge, on the dot's line. */
export function hangSlot(x: number, em: number, depth: number = HANG_DEPTH, hangY: number = HANG_Y): V {
  return { x, y: hangY - depth * em };
}

/**
 * The hanging pose, px, for a dot centred at `centre` (the top edge's line
 * when settled; lower while a tug pulls it down). The anchors don't follow the
 * dot: the letters stay where they are.
 */
export function hangPose(centre: V, h: HangMetrics, depth: number = HANG_DEPTH, hangY: number = HANG_Y): Pose {
  return {
    slot: hangSlot(centre.x, h.em, depth, hangY),
    dot: { x: centre.x - h.size / 2, y: centre.y - h.size / 2 },
    size: h.size,
    em: h.em,
    p: 1,
  };
}

/**
 * Where the threads' anchors are while the rig blends from the title pose
 * (`p` = 0, on the letters at `slot`) to hanging (`p` = 1, `hangSlot`). By the
 * time the pose is fully hanging the letters are off the top of the screen, so
 * moving the anchors onto the hang's own is never seen, and it is what makes
 * the end of an exit the same picture as a cold load.
 */
export function anchorSlot(slot: V, em: number, p: number, depth: number = HANG_DEPTH, hangY: number = HANG_Y): V {
  const k = clamp01(p);
  const to = hangSlot(slot.x, em, depth, hangY);
  return { x: slot.x, y: slot.y + (to.y - slot.y) * k };
}

/**
 * The dot's size and em as the title grows by `k` on its way out: the title's
 * own, `m`, grown with it, and eased onto the hang's as the growth completes,
 * so the exit lands exactly on `hang` even where the engine's rasterised full
 * stop is not quite `HANG_DOT_INK` wide. (In Chromium it is; the correction is
 * nothing.)
 */
export function grownDot(m: HangMetrics, k: number, hang: HangMetrics, scale: number = TITLE_EXIT_SCALE): HangMetrics {
  const progress = scale === 1 ? 1 : clamp01((k - 1) / (scale - 1));
  const ease = (own: number, to: number) => {
    const grown = own * k;
    const end = own * scale;
    return end > 0 ? grown * (1 + (to / end - 1) * progress) : grown;
  };
  return { size: ease(m.size, hang.size), em: ease(m.em, hang.em) };
}

/** The hanging pose laid out for SSR. Units are 1/`HANG_UNITS` em, about the dot's resting centre. */
export const HANG_UNITS = 1000;

export interface HangMarkup {
  /** SVG path data, one per thread, in rig order. */
  paths: string[];
  /** The dot's square. */
  dot: { x: number; y: number; size: number };
  /** The viewBox: everything drawn, the dot's centre at (0, 0). */
  box: { x: number; y: number; width: number; height: number };
}

/**
 * The hanging pose in em-units for the SSR copy of the mark: CSS scales the
 * viewBox by `--mark-hang-em` and puts (0, 0) at the top-centre of the screen.
 * The box is the hull of every point the curves pass between, so nothing
 * drawn falls outside it.
 */
export function hangMarkup(rig: MarkRig, ink: number = HANG_DOT_INK, depth: number = HANG_DEPTH): HangMarkup {
  const h: HangMetrics = { size: ink * HANG_UNITS, em: HANG_UNITS };
  const pose = hangPose({ x: 0, y: 0 }, h, depth, 0);
  const geoms = poseThreads(rig, pose);
  const pts: V[] = [pose.dot, { x: pose.dot.x + h.size, y: pose.dot.y + h.size }];
  for (const g of geoms) pts.push(g.A, g.B, g.c1, g.c2);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.floor(Math.min(...xs));
  const y = Math.floor(Math.min(...ys));
  return {
    paths: geoms.map(threadPathData),
    dot: { x: pose.dot.x, y: pose.dot.y, size: h.size },
    box: { x, y, width: Math.ceil(Math.max(...xs)) - x, height: Math.ceil(Math.max(...ys)) - y },
  };
}
