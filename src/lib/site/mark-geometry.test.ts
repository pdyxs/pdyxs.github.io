import { describe, it, expect } from 'vitest';
import {
  chordPoint,
  toChord,
  poseThreads,
  threadPathData,
  tauten,
  toolPivot,
  stepBauble,
  DROP,
  REEL,
  type StringSpring,
  baublePos,
  baubleAt,
  baubleMoving,
  type Bauble,
} from '@site/mark-geometry';
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

describe('tauten', () => {
  const g = { A: { x: 0, y: 0 }, B: { x: 90, y: 0 }, c1: { x: 10, y: 40 }, c2: { x: 70, y: -40 } };

  it('leaves the slack alone at 0 and straightens it at 1', () => {
    expect(tauten(g, 0)).toEqual(g);
    const t = tauten(g, 1);
    expect(t.c1).toEqual({ x: 30, y: 0 });
    expect(t.c2).toEqual({ x: 60, y: 0 });
    expect(t.A).toEqual(g.A);
    expect(t.B).toEqual(g.B);
  });
});

describe('toolPivot', () => {
  const g = { A: { x: 40, y: -300 }, B: { x: 100, y: 20 }, c1: { x: 0, y: 0 }, c2: { x: 0, y: 0 } };

  it('hangs from the anchor while the title is on screen', () => {
    expect(toolPivot(g, false, 0)).toEqual(g.A);
  });

  it('hangs from where the taut thread crosses the top edge once hanging', () => {
    const p = toolPivot(g, true, 0);
    expect(p.y).toBe(0);
    expect(p.x).toBeCloseTo(40 + 60 * (300 / 320), 10);
  });

  it('keeps an anchor that is still on screen', () => {
    const on = { ...g, A: { x: 40, y: 50 } };
    expect(toolPivot(on, true, 0)).toEqual(on.A);
  });
});

describe('stepBauble', () => {
  const run = (b: Bauble, len: number, seconds: number, spring: StringSpring = DROP) => {
    for (let t = 0; t < seconds; t += 1 / 240) b = stepBauble(b, len, 1 / 240, spring);
    return b;
  };

  /** Seconds until the string is within 1px of `len` (and stays there). */
  const settleTime = (start: Bauble, len: number, spring: StringSpring) => {
    let b = start;
    let last = 0;
    for (let t = 0; t < 6; t += 1 / 240) {
      b = stepBauble(b, len, 1 / 240, spring);
      if (Math.abs(b.r - len) > 1) last = t;
    }
    return last;
  };

  it('drops out to the string length, then settles straight down', () => {
    const b = run({ r: 0, rv: 0, theta: 0, omega: 0 }, 130, 4);
    expect(b.r).toBeCloseTo(130, 0);
    expect(baubleMoving(b, 130)).toBe(false);
  });

  it('swings back from a displaced position and loses energy', () => {
    const start = baubleAt({ x: 0, y: 0 }, { x: 80, y: 100 });
    const b = run(start, 130, 8);
    expect(Math.abs(b.theta)).toBeLessThan(Math.abs(start.theta) / 4);
    expect(baublePos({ x: 0, y: 0 }, { r: 10, rv: 0, theta: 0, omega: 0 })).toEqual({ x: 0, y: 10 });
  });

  it('reels up to nothing without running past it', () => {
    let b: Bauble = { r: 130, rv: 0, theta: 0, omega: 0 };
    let min = Infinity;
    for (let t = 0; t < 4; t += 1 / 240) {
      b = stepBauble(b, 0, 1 / 240, REEL);
      min = Math.min(min, b.r);
    }
    expect(b.r).toBeLessThan(1);
    expect(min).toBeGreaterThan(-1);
  });

  it('falls out faster than it is reeled up', () => {
    const out = settleTime({ r: 0, rv: 0, theta: 0, omega: 0 }, 130, DROP);
    const up = settleTime({ r: 130, rv: 0, theta: 0, omega: 0 }, 0, REEL);
    expect(out).toBeLessThan(up);
  });
});
