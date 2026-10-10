import { describe, it, expect } from 'vitest';
import { chordPoint, toChord, poseThreads, threadPathData } from '@site/mark-geometry';
import { MARK_RIG } from '@data/mark-rig';

describe('chord frame', () => {
  const A = { x: 10, y: 20 };
  const B = { x: 110, y: 20 };

  it('t runs along the chord and +u is down for a left-to-right chord', () => {
    expect(chordPoint(A, B, { t: 0.5, u: 0 })).toEqual({ x: 60, y: 20 });
    expect(chordPoint(A, B, { t: 0.5, u: 0.1 })).toEqual({ x: 60, y: 30 });
  });

  it('toChord inverts chordPoint', () => {
    const A2 = { x: -3, y: 7 };
    const B2 = { x: 40, y: -25 };
    const c = { t: 0.3, u: -0.42 };
    const back = toChord(A2, B2, chordPoint(A2, B2, c));
    expect(back.t).toBeCloseTo(c.t, 10);
    expect(back.u).toBeCloseTo(c.u, 10);
  });
});

describe('poseThreads', () => {
  const base = { slot: { x: 100, y: 100 }, dot: { x: 95, y: 95 }, size: 10, em: 100 };

  it('ties each thread to its anchor and its attach point', () => {
    const g = poseThreads(MARK_RIG, { ...base, p: 0 });
    MARK_RIG.threads.forEach((t, i) => {
      expect(g[i].A).toEqual({ x: 100 + t.anchor.x * 100, y: 100 + t.anchor.y * 100 });
      expect(g[i].B).toEqual({ x: 95 + t.attach.x * 10, y: 95 + t.attach.y * 10 });
    });
  });

  it('the hanging pose puts control points at em offsets from the attach point', () => {
    const g = poseThreads(MARK_RIG, { ...base, p: 1 });
    const t = MARK_RIG.threads[3];
    expect(g[3].c2.x).toBeCloseTo(g[3].B.x + t.hang[1].x * 100, 10);
    expect(g[3].c2.y).toBeCloseTo(g[3].B.y + t.hang[1].y * 100, 10);
  });

  it('halfway blends the two poses', () => {
    const [r, h, m] = [0, 1, 0.5].map((p) => poseThreads(MARK_RIG, { ...base, p })[0].c1);
    expect(m.x).toBeCloseTo((r.x + h.x) / 2, 10);
    expect(m.y).toBeCloseTo((r.y + h.y) / 2, 10);
  });

  it('draws a cubic from anchor to dot', () => {
    const d = threadPathData(poseThreads(MARK_RIG, { ...base, p: 0 })[0]);
    expect(d).toMatch(/^M\S+ \S+ C\S+ \S+ \S+ \S+ \S+ \S+$/);
  });
});
