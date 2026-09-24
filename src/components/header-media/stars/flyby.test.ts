import { describe, it, expect } from 'vitest';
import { flyby, headingBetween } from './flyby';

const tuning = { farCone: 40, closeCone: 90, maxTurn: 120 };

describe('headingBetween', () => {
  it('is 0 straight up, 90 to the right', () => {
    expect(headingBetween({ x: 0, y: 4 }, { x: 0, y: 0 })).toBeCloseTo(0);
    expect(headingBetween({ x: 0, y: 0 }, { x: 3, y: 0 })).toBeCloseTo(90);
    expect(headingBetween({ x: 0, y: 0 }, { x: -3, y: 0 })).toBeCloseTo(-90);
  });
});

describe('flyby', () => {
  it('a plain click keeps the incoming heading and the far cone', () => {
    expect(flyby(0, 30, tuning)).toEqual({ heading: 30, coneAngle: 40 });
  });

  it('the closest pass bends by maxTurn and opens the close cone', () => {
    expect(flyby(1, 30, tuning)).toEqual({ heading: 150, coneAngle: 90 });
    expect(flyby(-1, 30, tuning)).toEqual({ heading: -90, coneAngle: 90 });
  });

  it('changes fastest near the middle', () => {
    const near = flyby(0.1, 0, tuning)!.heading;
    const far = flyby(1, 0, tuning)!.heading - flyby(0.9, 0, tuning)!.heading;
    expect(near).toBeGreaterThan(far);
  });

  it('is off out of range', () => {
    expect(flyby(1.01, 0, tuning)).toBeNull();
    expect(flyby(-2, 0, tuning)).toBeNull();
  });
});
