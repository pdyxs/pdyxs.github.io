import { describe, it, expect } from 'vitest';
import { stopLength, coast, afterStop, lowestCommitment } from './commitment';
import { simulateEncounter, poseAtCommitment } from './encounter';
import { defaultTuning, type Tuning } from './tuning';

const tuning: Tuning = { ...defaultTuning };
const mu = 0.3;
const enc = simulateEncounter(-0.5, mu, tuning);

describe('stopLength', () => {
  it('none is 0, constant is its length, distance scales with distance', () => {
    expect(stopLength({ mode: 'none' }, 2)).toBe(0);
    expect(stopLength({ mode: 'constant', length: 0.4 }, 2)).toBe(0.4);
    expect(stopLength({ mode: 'distance', perUnit: 0.5 }, 2)).toBe(1);
  });
});

describe('coast', () => {
  it('lasts exactly the duration and starts at the pose', () => {
    const start = poseAtCommitment(enc, 0.5);
    const path = coast(start, 0.37, mu, tuning);
    expect(path[0]).toEqual(start);
    expect(path.at(-1)!.t).toBeCloseTo(start.t + 0.37, 9);
  });

  it('with no gravity drifts in a straight line', () => {
    const start = poseAtCommitment(enc, 0.5);
    const end = coast(start, 0.5, 0, tuning).at(-1)!;
    expect(end.x).toBeCloseTo(start.x + start.vx * 0.5, 9);
    expect(end.y).toBeCloseTo(start.y + start.vy * 0.5, 9);
  });

  it('keeps being pulled by the planet', () => {
    const start = poseAtCommitment(enc, 0.2);
    const pulled = coast(start, 0.5, mu, tuning).at(-1)!;
    const free = coast(start, 0.5, 0, tuning).at(-1)!;
    expect(pulled.x).toBeGreaterThan(free.x); // planet is on the right
  });

  it('a zero duration is just the start', () => {
    const start = poseAtCommitment(enc, 0.5);
    expect(coast(start, 0, mu, tuning)).toEqual([start]);
  });
});

describe('afterStop', () => {
  it('with mode none returns the choice pose unchanged', () => {
    const t: Tuning = { ...tuning, stopRule: { mode: 'none' } };
    const r = afterStop(enc, 0.4, t.stopRule, mu, t);
    expect(r.stopLength).toBe(0);
    expect(r.choice).toEqual(poseAtCommitment(enc, 0.4));
    expect(r.steerStart).toEqual(r.choice);
    expect(r.stopPath).toEqual([r.choice]);
  });

  it('a constant stop of T moves the ship along its ballistic path for exactly T', () => {
    const rule = { mode: 'constant', length: 0.3 } as const;
    const r = afterStop(enc, 0.4, rule, mu, tuning);
    expect(r.stopLength).toBe(0.3);
    expect(r.steerStart.t - r.choice.t).toBeCloseTo(0.3, 9);
    expect(r.stopPath[0]).toEqual(r.choice);
    expect(r.stopPath.at(-1)).toEqual(r.steerStart);
  });

  it('a distance stop uses the distance at the choice point', () => {
    const rule = { mode: 'distance', perUnit: 0.5 } as const;
    const r = afterStop(enc, 0.4, rule, mu, tuning);
    expect(r.stopLength).toBeCloseTo(0.5 * Math.hypot(r.choice.x, r.choice.y), 12);
  });
});

describe('lowestCommitment', () => {
  const T = 0.4;
  const rule = { mode: 'constant', length: T } as const;

  it('puts the choice point about keepFactor * T before the planet', () => {
    const c = lowestCommitment(enc, rule, 0.75, mu, tuning);
    const y = poseAtCommitment(enc, c).y;
    expect(y).toBeGreaterThanOrEqual(-0.75 * T);
    expect(y).toBeLessThan(-0.75 * T + 0.05);
    expect(c).toBeGreaterThan(0);
  });

  it('is 0 when keepFactor is 0', () => {
    expect(lowestCommitment(enc, rule, 0, mu, tuning)).toBe(0);
  });

  it('is lower for a longer stop', () => {
    const short = lowestCommitment(enc, { mode: 'constant', length: 0.2 }, 0.75, mu, tuning);
    const long = lowestCommitment(enc, { mode: 'constant', length: 0.6 }, 0.75, mu, tuning);
    expect(long).toBeLessThan(short);
  });

  it('with no stop, the choice point may not be before the planet at all', () => {
    const c = lowestCommitment(enc, { mode: 'none' }, 0.75, mu, tuning);
    expect(poseAtCommitment(enc, c).y).toBeGreaterThanOrEqual(0);
  });

  it('uses the distance at each point for a distance rule', () => {
    const d = { mode: 'distance', perUnit: 0.5 } as const;
    const c = lowestCommitment(enc, d, 0.75, mu, tuning);
    const p = poseAtCommitment(enc, c);
    expect(p.y).toBeGreaterThanOrEqual(-0.75 * 0.5 * Math.hypot(p.x, p.y));
  });

});
