import { describe, it, expect } from 'vitest';
import { stepsDue } from './clock';

describe('stepsDue', () => {
  it('turns elapsed time into whole fixed steps, carrying the remainder', () => {
    expect(stepsDue(0, 0.05, 0.01, 5)).toEqual({ steps: 5, remainder: 0 });
    const r = stepsDue(0.004, 0.025, 0.01, 5);
    expect(r.steps).toBe(2);
    expect(r.remainder).toBeCloseTo(0.009);
  });

  it('caps steps and drops the backlog after a stall', () => {
    expect(stepsDue(0, 10, 0.01, 5)).toEqual({ steps: 5, remainder: 0 });
  });
});
