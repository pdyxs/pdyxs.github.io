import { describe, it, expect } from 'vitest';
import { routeWithCurvature, solveApproachByCurvature } from './approachCurvature';
import { Planet } from '../planet';
import { defaultTuning, type Tuning } from './tuning';

const tuning: Tuning = { ...defaultTuning, shipSpeed: 2, turnRadius: 1.5 };
const R = tuning.turnRadius;
const pose = { x: 0, y: 4, heading: 0 };
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const polyLength = (pts: { x: number; y: number }[]) =>
  pts.slice(1).reduce((s, p, i) => s + dist(p, pts[i]), 0);

describe('routeWithCurvature', () => {
  it('kappa = 0 is the straight line to E', () => {
    const E = { x: 2, y: 0 };
    const r = routeWithCurvature(pose, E, 0, tuning)!;
    expect(r.points).toHaveLength(2);
    expect(r.points[0]).toEqual({ x: 0, y: 4 });
    expect(dist(r.points[1], E)).toBeLessThan(1e-9);
    expect(r.length).toBeCloseTo(dist(pose, E), 9);
    // heading is clockwise from up: up and to the right is between 0 and 90
    expect(r.arrivalHeading).toBeCloseTo((Math.atan2(2, 4) * 180) / Math.PI, 9);
  });

  it('kappa = 1/R turns on the turning circle, then leaves tangentially to E', () => {
    const E = { x: 4, y: 0 }; // to the right and ahead
    const r = routeWithCurvature(pose, E, 1 / R, tuning)!;
    expect(r).not.toBeNull();
    const centre = { x: R, y: 4 }; // right of a ship facing up
    // every point on the arc lies on the circle; find the last such point
    const onCircle = r.points.filter((p) => Math.abs(dist(p, centre) - R) < 1e-6);
    expect(onCircle.length).toBeGreaterThan(2);
    const leave = onCircle.at(-1)!;
    // the leg from the departure point to E is perpendicular to the radius there
    const leg = { x: E.x - leave.x, y: E.y - leave.y };
    const radius = { x: leave.x - centre.x, y: leave.y - centre.y };
    expect(leg.x * radius.x + leg.y * radius.y).toBeCloseTo(0, 5);
    expect(dist(r.points.at(-1)!, E)).toBeLessThan(1e-9);
    expect(r.length).toBeCloseTo(polyLength(r.points), 1);
    // the straight leg's direction is the arrival heading
    const h = (r.arrivalHeading * Math.PI) / 180;
    expect(leg.x / Math.hypot(leg.x, leg.y)).toBeCloseTo(Math.sin(h), 6);
    expect(leg.y / Math.hypot(leg.x, leg.y)).toBeCloseTo(-Math.cos(h), 6);
  });

  it('turns toward the side E is on', () => {
    const left = routeWithCurvature(pose, { x: -4, y: 0 }, 1 / R, tuning)!;
    expect(left.arrivalHeading).toBeLessThan(0);
    const right = routeWithCurvature(pose, { x: 4, y: 0 }, 1 / R, tuning)!;
    expect(right.arrivalHeading).toBeGreaterThan(0);
  });

  // NOTE: the issue asks for heading and length to grow with kappa. With the
  // geometry it specifies (turn towards E's side, tangent that continues the
  // turn) they shrink: a tighter circle is closer to the direct line. This pins
  // the behaviour the specified geometry actually has.
  it('over the reachable curvatures, more curvature gives a shorter route and an arrival heading nearer the direct line', () => {
    const E = { x: 3, y: -2 };
    let prev: { arrivalHeading: number; length: number } | null = null;
    for (const f of [0.2, 0.3, 0.4, 0.6, 0.8, 1]) {
      const r = routeWithCurvature(pose, E, f / R, tuning)!;
      expect(r).not.toBeNull();
      if (prev) {
        expect(r.arrivalHeading).toBeLessThan(prev.arrivalHeading);
        expect(r.length).toBeLessThan(prev.length);
      }
      prev = r;
    }
  });

  it('small curvatures put E inside the turning circle: null', () => {
    // E = (3, 0) from (0, 4): the circle is reachable only for rho < 25/6
    expect(routeWithCurvature(pose, { x: 3, y: 0 }, 0.1 / R, tuning)).toBeNull();
  });

  it('E inside the turning circle is unreachable', () => {
    // centre (R, 4); E at distance 0.5 from it
    expect(routeWithCurvature(pose, { x: R, y: 4.5 }, 1 / R, tuning)).toBeNull();
  });
});

describe('solveApproachByCurvature', () => {
  const planet = new Planet({ r: 3, e: 0, angle: 0, period: 20, phase: 0.75, mass: 1 });
  const ship = { x: 0, y: 6, heading: 0 };
  const solve = (kappa: number, offset: number, time = 0) =>
    solveApproachByCurvature({ pose: ship, time, planet, offset, kappa, tuning });

  it('the route ends at the entry point at a time the ship can fly it', () => {
    const a = solve(0.8 / R, 0.5, 1)!;
    expect(a).not.toBeNull();
    expect(dist(a.route.points.at(-1)!, a.entryPoint)).toBeLessThan(1e-6);
    expect(tuning.shipSpeed * (a.arrivalTime - 1)).toBeCloseTo(a.route.length, 4);
    expect(a.arrivalHeading).toBe(a.route.arrivalHeading);
  });

  it.each([-0.7, 0, 0.5])('the entry point is on the incoming line, %f from the planet', (offset) => {
    const a = solve(1 / R, offset)!;
    expect(a).not.toBeNull();
    const P = planet.positionAt(a.arrivalTime);
    const h = (a.arrivalHeading * Math.PI) / 180;
    const along = { x: Math.sin(h), y: -Math.cos(h) };
    const right = { x: Math.cos(h), y: Math.sin(h) };
    const rel = { x: a.entryPoint.x - P.x, y: a.entryPoint.y - P.y };
    // signed lateral distance of the line from the planet: E = P + offset * n(h) - h_dir * encounterStart
    expect(rel.x * right.x + rel.y * right.y).toBeCloseTo(offset, 6);
    expect(rel.x * along.x + rel.y * along.y).toBeCloseTo(-tuning.encounterStart, 6);
  });

  it('a more curved route arrives at a different time, with the planet elsewhere', () => {
    const straight = solve(0, 0.5)!;
    const curved = solve(1 / R, 0.5)!;
    expect(straight).not.toBeNull();
    expect(curved).not.toBeNull();
    expect(curved.arrivalTime).not.toBeCloseTo(straight.arrivalTime, 3);
    const p0 = planet.positionAt(straight.arrivalTime);
    const p1 = planet.positionAt(curved.arrivalTime);
    expect(dist(p0, p1)).toBeGreaterThan(1e-3);
  });

  it('is null for a planet that never comes within reach', () => {
    // a ship too slow to cover the distance in four orbits
    const slow = { ...tuning, shipSpeed: 0.001 };
    expect(solveApproachByCurvature({ pose: ship, time: 0, planet, offset: 0, kappa: 0, tuning: slow })).toBeNull();
  });
});
