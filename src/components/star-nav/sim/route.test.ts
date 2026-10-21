import { describe, it, expect } from 'vitest';
import { headingBetween, routeUpTo } from './route';

const route = [{ x: 0, y: 0 }, { x: 0, y: -2 }, { x: 2, y: -2 }];

describe('headingBetween', () => {
  it('is degrees clockwise from straight up', () => {
    expect(headingBetween({ x: 0, y: 0 }, { x: 0, y: -1 })).toBeCloseTo(0);
    expect(headingBetween({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(90);
  });
});

describe('routeUpTo', () => {
  it('at 0 is the start, facing the first leg', () => {
    const r = routeUpTo(route, 0);
    expect(r.points).toEqual([{ x: 0, y: 0 }]);
    expect(r.pose).toEqual({ x: 0, y: 0, heading: 0 });
  });

  it('part way along a leg, ends there with that leg heading', () => {
    const r = routeUpTo(route, 0.75); // 3 of 4 units: 1 into the second leg
    expect(r.points).toEqual([{ x: 0, y: 0 }, { x: 0, y: -2 }, { x: 1, y: -2 }]);
    expect(r.pose.heading).toBeCloseTo(90);
  });

  it('at 1 is the whole route', () => {
    const r = routeUpTo(route, 1);
    expect(r.points).toEqual(route);
    expect(r.pose.x).toBeCloseTo(2);
  });
});
