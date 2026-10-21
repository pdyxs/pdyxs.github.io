import { describe, it, expect } from 'vitest';
import { acceleration } from './gravity';
import { defaultTuning, type Tuning } from './tuning';

const tuning: Tuning = { ...defaultTuning, gravitySoftening: 0.1 };

describe('acceleration', () => {
  it('pulls towards the planet at the origin', () => {
    const a = acceleration({ x: 2, y: 0 }, 1, tuning);
    expect(a.x).toBeLessThan(0);
    expect(a.y).toBeCloseTo(0);
  });

  it('is softened inverse-square: -mu p / (|p|^2 + eps^2)^1.5', () => {
    const a = acceleration({ x: 3, y: 4 }, 2, tuning);
    const k = -2 / Math.pow(25 + 0.01, 1.5);
    expect(a.x).toBeCloseTo(3 * k, 12);
    expect(a.y).toBeCloseTo(4 * k, 12);
  });

  it('is zero at the core and finite near it, and scales with mu', () => {
    expect(acceleration({ x: 0, y: 0 }, 1, tuning)).toEqual({ x: 0, y: 0 });
    const near = acceleration({ x: 1e-6, y: 0 }, 1, tuning);
    expect(Number.isFinite(near.x)).toBe(true);
    const a1 = acceleration({ x: 1, y: 1 }, 1, tuning);
    const a3 = acceleration({ x: 1, y: 1 }, 3, tuning);
    expect(a3.x).toBeCloseTo(3 * a1.x);
  });
});
