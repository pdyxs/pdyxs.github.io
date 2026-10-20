import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MARK_RIG } from '@data/mark-rig';
import { poseThreads, type ThreadGeometry } from '@site/mark/geometry';
import { FALLBACK_DOT_INK } from '@site/mark/measure';
import {
  HANG_Y,
  TITLE_EXIT_MS,
  TITLE_EXIT_SCALE,
  hangSeparation,
  poseBlend,
  titleExit,
  type TitleStart,
} from '@site/mark/motion';
import {
  HANG_DEPTH,
  HANG_DOT_INK,
  HANG_UNITS,
  anchorSlot,
  grownDot,
  hangFromTitle,
  hangMarkup,
  hangMetrics,
  hangPose,
  hangSlot,
} from '@site/mark/hang';

const css = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

/** Every point of every thread, flattened, for comparing two poses. */
const flat = (gs: ThreadGeometry[]) => gs.flatMap((g) => [g.A, g.c1, g.c2, g.B]).flatMap((v) => [v.x, v.y]);

describe('the hang size, and where it comes from', () => {
  it("is the title's em grown by the exit, and that em times the full stop's ink", () => {
    expect(hangFromTitle(54)).toEqual({ em: 162, size: 162 * HANG_DOT_INK });
    expect(hangFromTitle(36).em).toBe(108);
    expect(hangFromTitle(36).size).toBeCloseTo(10.26, 6);
  });

  it("is the Chromium-measured full stop's ink width", () => {
    expect(HANG_DOT_INK).toBeCloseTo(FALLBACK_DOT_INK.right - FALLBACK_DOT_INK.left, 9);
  });

  it('gets its em back from the size the CSS resolved', () => {
    const h = hangFromTitle(54);
    expect(hangMetrics(h.size).em).toBeCloseTo(h.em, 9);
  });

  it('is the same two factors in tokens.css, from the title size the title itself uses', () => {
    // The single source is the CSS (the browser resolves it and the script
    // reads it back); these are its TS twins and must not drift from it.
    const tokens = css('../../../styles/tokens.css');
    expect(tokens).toMatch(/--page-title-size:\s*clamp\(2rem, 5vw, 3rem\);/);
    const em = tokens.match(/--mark-hang-em:\s*calc\(var\(--page-title-size\) \* ([\d.]+)\);/);
    const size = tokens.match(/--mark-hang-size:\s*calc\(var\(--mark-hang-em\) \* ([\d.]+)\);/);
    expect(Number(em?.[1])).toBe(TITLE_EXIT_SCALE);
    expect(Number(size?.[1])).toBe(HANG_DOT_INK);
    expect(css('../../../styles/card-chrome.css')).toMatch(/\.page-title \{[^}]*font-size: var\(--page-title-size\);/);
  });
});

describe('hangPose', () => {
  const h = hangFromTitle(54);

  it('centres the dot where it is told, and hangs the letters HANG_DEPTH em above the edge', () => {
    const pose = hangPose({ x: 640, y: HANG_Y }, h);
    expect(pose.slot).toEqual({ x: 640, y: HANG_Y - HANG_DEPTH * h.em });
    expect(pose.dot).toEqual({ x: 640 - h.size / 2, y: HANG_Y - h.size / 2 });
    expect(pose).toMatchObject({ size: h.size, em: h.em, p: 1 });
  });

  it('leaves the letters where they are while a tug pulls the dot down', () => {
    expect(hangPose({ x: 640, y: 5 }, h).slot).toEqual(hangPose({ x: 640, y: HANG_Y }, h).slot);
  });

  it('is fully hanging by poseBlend, with the depth as its separation', () => {
    expect(poseBlend(true, hangSlot(640, h.em).y, HANG_DEPTH * h.em)).toBe(1);
  });
});

describe('hangMarkup (the SSR pose)', () => {
  const mk = hangMarkup(MARK_RIG);

  it('puts the dot centred on (0, 0), HANG_DOT_INK em across', () => {
    expect(mk.dot.size).toBeCloseTo(HANG_DOT_INK * HANG_UNITS, 9);
    expect(mk.dot.x + mk.dot.size / 2).toBeCloseTo(0, 9);
    expect(mk.dot.y + mk.dot.size / 2).toBeCloseTo(0, 9);
  });

  it('draws one thread per rig thread', () => {
    expect(mk.paths).toHaveLength(MARK_RIG.threads.length);
    for (const d of mk.paths) expect(d).toMatch(/^M-?[\d.]+ -?[\d.]+ C/);
  });

  it('has a box around everything it draws', () => {
    const gs = poseThreads(MARK_RIG, hangPose({ x: 0, y: 0 }, { size: HANG_DOT_INK * HANG_UNITS, em: HANG_UNITS }, HANG_DEPTH, 0));
    const pts = gs.flatMap((g) => [g.A, g.B, g.c1, g.c2]);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(mk.box.x);
      expect(p.x).toBeLessThanOrEqual(mk.box.x + mk.box.width);
      expect(p.y).toBeGreaterThanOrEqual(mk.box.y);
      expect(p.y).toBeLessThanOrEqual(mk.box.y + mk.box.height);
    }
  });

  it('is the live pose scaled: em units about the dot, at any title size and viewport', () => {
    // What CSS does to the SSR copy (scale by the em, put (0, 0) at the
    // top-centre) gives the pose the script draws.
    for (const [title, width] of [[54, 1280], [36, 390]]) {
      const h = hangFromTitle(title);
      const live = flat(poseThreads(MARK_RIG, hangPose({ x: width / 2, y: HANG_Y }, h)));
      const ssr = flat(poseThreads(MARK_RIG, hangPose({ x: 0, y: 0 }, { size: HANG_DOT_INK * HANG_UNITS, em: HANG_UNITS }, HANG_DEPTH, 0)));
      const placed = ssr.map((v, i) => (i % 2 === 0 ? width / 2 : HANG_Y) + (v * h.em) / HANG_UNITS);
      live.forEach((v, i) => expect(v).toBeCloseTo(placed[i], 6));
    }
  });
});

describe('the end of an exit is the cold hang', () => {
  // The title's own dot, as measured in the title: a touch wider than
  // HANG_DOT_INK, as another engine might rasterise it.
  const titlePx = 54;
  const m = { size: 0.1 * titlePx, em: titlePx };
  const hang = hangFromTitle(titlePx);
  const viewport = { width: 1280, height: 900 };
  const start: TitleStart = { slot: { x: 300, y: 110 }, titleOrigin: { x: 40, y: 52 }, headerHeight: 201 };

  it('grows the dot from its own size onto the hang', () => {
    expect(grownDot(m, 1, hang)).toEqual(m);
    const end = grownDot(m, TITLE_EXIT_SCALE, hang);
    expect(end.size).toBeCloseTo(hang.size, 9);
    expect(end.em).toBeCloseTo(hang.em, 9);
    // Monotonic on the way.
    const mid = grownDot(m, 2, hang);
    expect(mid.size).toBeGreaterThan(m.size);
    expect(mid.size).toBeLessThan(end.size);
  });

  it('is plain growth where the ink is the hang ink', () => {
    const exact = { size: HANG_DOT_INK * titlePx, em: titlePx };
    const g = grownDot(exact, 2, hang);
    expect(g.size).toBeCloseTo(exact.size * 2, 9);
    expect(g.em).toBeCloseTo(exact.em * 2, 9);
  });

  it('moves the anchors from the letters to the hang as the pose blends', () => {
    const slot = { x: 300, y: -20 };
    expect(anchorSlot(slot, 100, 0)).toEqual(slot);
    expect(anchorSlot(slot, 100, 1)).toEqual(hangSlot(300, 100));
    expect(anchorSlot(slot, 100, 0.5).y).toBeCloseTo((-20 + hangSlot(300, 100).y) / 2, 9);
  });

  it("draws, at the exit's last frame, exactly the threads a cold load draws", () => {
    const f = titleExit(start, viewport, TITLE_EXIT_MS);
    const g = grownDot(m, f.title.scale, hang);
    const p = poseBlend(true, f.title.slot.y, hangSeparation(start.headerHeight, start.slot.y));
    expect(p).toBe(1);
    const centre = { x: f.title.slot.x, y: HANG_Y };
    const exitEnd = poseThreads(MARK_RIG, {
      slot: anchorSlot(f.title.slot, g.em, p),
      dot: { x: centre.x - g.size / 2, y: centre.y - g.size / 2 },
      size: g.size,
      em: g.em,
      p,
    });
    const cold = poseThreads(MARK_RIG, hangPose({ x: viewport.width / 2, y: HANG_Y }, hang));
    const a = flat(exitEnd);
    flat(cold).forEach((v, i) => expect(a[i]).toBeCloseTo(v, 6));
  });
});
