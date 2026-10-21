import { describe, it, expect } from 'vitest';
import { planApproach } from './approach';
import { Planet } from '../planet';
import { defaultTuning, type Tuning } from './tuning';

const tuning: Tuning = { ...defaultTuning, shipSpeed: 2, turnRadius: 1.5, turnCap: 55 };
const pose = { x: 0, y: 4, heading: 0 };
const planetData = { r: 3, e: 0, angle: 0, period: 20, phase: 0, mass: 1 };
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('planApproach', () => {
  it('reaches a planet at the arrival time, the route ending on it', () => {
    // phase puts the planet ahead of the ship (up) at the start
    const planet = new Planet({ ...planetData, phase: 0.75 });
    const plan = planApproach(pose, 0, planet, tuning)!;
    expect(plan).not.toBeNull();
    expect(plan.arrivalTime).toBeGreaterThan(0);
    const end = plan.route.at(-1)!;
    const there = planet.positionAt(plan.arrivalTime);
    expect(dist(end, there)).toBeLessThan(1e-3);
    expect(plan.arrivalPose.x).toBeCloseTo(end.x);
    expect(plan.arrivalPose.y).toBeCloseTo(end.y);
  });

  it('route length is shipSpeed times the flight time', () => {
    const planet = new Planet({ ...planetData, phase: 0.7 });
    const plan = planApproach(pose, 3, planet, tuning)!;
    const len = plan.route.slice(1).reduce((s, p, i) => s + dist(p, plan.route[i]), 0);
    expect(len).toBeCloseTo(tuning.shipSpeed * (plan.arrivalTime - 3), 2);
  });

  it('a planet dead ahead is reached with no arc, arriving on the same heading', () => {
    // planet far from the star on a circular orbit crossing straight ahead: a
    // stationary-ish target via a huge period
    const planet = new Planet({ r: 3, e: 0, angle: 0, period: 1e9, phase: 0.75, mass: 1 });
    // phase 0.75 -> (0, -3) is "up" only if angle works out; assert whatever
    // the geometry gives is straight: all route points on the line x = 0.
    const p0 = planet.positionAt(0);
    const plan = planApproach({ x: p0.x, y: 4, heading: 0 }, 0, planet, tuning)!;
    expect(plan).not.toBeNull();
    for (const p of plan.route) expect(p.x).toBeCloseTo(p0.x, 4);
    expect(plan.arrivalPose.heading).toBeCloseTo(0, 3);
  });

  it('a curved approach arrives heading differently from how it left', () => {
    const planet = new Planet({ r: 3, e: 0, angle: 0, period: 1e9, phase: 0, mass: 1 }); // at (3, 0)
    const plan = planApproach({ x: 0, y: 4, heading: 0 }, 0, planet, tuning)!;
    expect(plan).not.toBeNull();
    expect(plan.arrivalPose.heading).toBeGreaterThan(1);
  });

  it('a planet beside the ship, inside the neck, is not visitable', () => {
    const planet = new Planet({ r: 1, e: 0, angle: 0, period: 1e9, phase: 0, mass: 1 }); // at (1, 0)
    expect(planApproach({ x: 0.5, y: 0, heading: 0 }, 0, planet, tuning)).toBeNull();
  });

  it('a planet outside the reach shape is not visitable', () => {
    const planet = new Planet({ r: 3, e: 0, angle: 0, period: 1e9, phase: 0.5, mass: 1 }); // at (-3, 0)
    expect(planApproach({ x: 3, y: 1, heading: 0 }, 0, planet, tuning)).toBeNull();
  });
});
