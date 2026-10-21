import { describe, it, expect } from 'vitest';
import { flightPlan } from './flightPlan';
import { planApproach } from './approach';
import { solveApproachByCurvature } from './approachCurvature';
import { reachShape } from './steering';
import { Planet } from '../planet';
import { defaultTuning, type Tuning } from './tuning';
import type { StarSystem } from '../star_system';

const tuning: Tuning = { ...defaultTuning, shipSpeed: 2, turnRadius: 1.5, turnCap: 55 };
const ship = { x: 0, y: 4, heading: 0 };
// ahead of the ship (up) at the start, moving slowly
const planet = new Planet({ r: 3, e: 0, angle: 0, period: 20, phase: 0.75, mass: 1 });
const system: StarSystem = { star: {}, planets: [planet] };
const approach = planApproach(ship, 0, planet, tuning)!;
const pinnedArrival = approach.arrivalTime;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

const plan = (controls: { offset: number; commit: number } = { offset: 0.5, commit: 0.5 }, over: Partial<Tuning> = {}) =>
  flightPlan({ ship, time: 0, system, target: 0, controls: { scheme: 'commitment', ...controls }, pinnedArrival, tuning: { ...tuning, ...over } })!;

describe('flightPlan', () => {
  it('flies a route from the ship, arriving at the pinned time', () => {
    const p = plan();
    expect(p.valid).toBe(true);
    expect(p.route[0]).toEqual({ x: 0, y: 4 });
    expect(p.arrivalTime).toBe(pinnedArrival);
    expect(p.positionAt(0)).toMatchObject({ x: 0, y: 4, heading: 0 });
  });

  it('ends the route at the encounter entry: encounterStart before the planet, offset to the side', () => {
    const arrival = planet.positionAt(pinnedArrival);
    const p = plan({ offset: 0.5, commit: 0.5 });
    const end = p.route.at(-1)!;
    // along the arrival heading the entry is encounterStart short of the planet, and offset across it
    const h = (approach.arrivalPose.heading * Math.PI) / 180;
    const ahead = { x: Math.sin(h), y: -Math.cos(h) };
    const right = { x: Math.cos(h), y: Math.sin(h) };
    const d = { x: end.x - arrival.x, y: end.y - arrival.y };
    expect(d.x * ahead.x + d.y * ahead.y).toBeCloseTo(-tuning.encounterStart, 6);
    expect(d.x * right.x + d.y * right.y).toBeCloseTo(0.5, 6);
    // the pose at the arrival time is the end of the route
    expect(dist(p.positionAt(pinnedArrival), end)).toBeLessThan(1e-9);
  });

  it('keeps the planet pinned: any controls arrive at the same time, at the same planet position', () => {
    const a = plan({ offset: 0.3, commit: 0.2 });
    const b = plan({ offset: -0.9, commit: 0.9 });
    expect(a.arrivalTime).toBe(b.arrivalTime);
    const arrival = planet.positionAt(pinnedArrival);
    for (const p of [a, b]) {
      expect(dist(p.encounterPath[0], arrival)).toBeLessThan(tuning.encounterStart + 1);
      expect(dist(p.positionAt(pinnedArrival), p.encounterPath[0])).toBeLessThan(1e-9);
    }
    // the route reshapes: different sides of the planet
    expect(dist(a.route.at(-1)!, b.route.at(-1)!)).toBeGreaterThan(1);
  });

  describe('encounter, stop and after pose', () => {
    const p = plan({ offset: 0.5, commit: 0.8 }, { stopRule: { mode: 'constant', length: 0.5 } });

    it('the encounter runs from the entry to the choice point, carried with the planet', () => {
      expect(p.encounterPath.length).toBeGreaterThan(2);
      expect(p.encounterPath.at(-1)).toEqual(p.choicePose);
      // the choice pose is at positionAt of its own time: planet drift is included
      const dt = tuning.encounterStep;
      const choiceTime = p.endTime - 0.5;
      expect(dist(p.positionAt(choiceTime), p.choicePose)).toBeLessThan(dt * 2 * 3);
    });

    it('the stop follows the choice point and lasts the stop rule', () => {
      expect(p.stopPath[0]).toEqual(p.choicePose);
      expect(p.stopPath.at(-1)).toEqual(p.afterPose);
      expect(p.endTime - p.arrivalTime).toBeGreaterThan(0.5);
    });

    it('positionAt covers the whole timeline and rests at the after pose', () => {
      expect(p.positionAt(p.endTime)).toEqual(p.afterPose);
      expect(p.positionAt(p.endTime + 5)).toEqual(p.afterPose);
      const mid = p.positionAt((p.arrivalTime + p.endTime) / 2);
      expect(Number.isFinite(mid.x) && Number.isFinite(mid.y) && Number.isFinite(mid.heading)).toBe(true);
    });

    it('a later commitment ends the encounter further on', () => {
      const early = plan({ offset: 0.5, commit: 0.6 }, { keepFactor: 0 });
      const late = plan({ offset: 0.5, commit: 1 }, { keepFactor: 0 });
      expect(late.encounterPath.length).toBeGreaterThan(early.encounterPath.length);
      expect(late.endTime).toBeGreaterThan(early.endTime);
    });
  });

  describe('timeline continuity', () => {
    it('never jumps across the approach, encounter and stop boundaries, and ends exactly at the after pose', () => {
      const p = plan({ offset: 0.5, commit: 0.8 });
      const dt = 0.002;
      // the fastest the ship moves is bounded by its speed plus the planet's drift
      const maxStep = (tuning.shipSpeed + 3) * dt;
      let prev = p.positionAt(0);
      for (let t = dt; t <= p.endTime; t += dt) {
        const cur = p.positionAt(t);
        expect(dist(cur, prev)).toBeLessThan(maxStep);
        prev = cur;
      }
      for (const boundary of [p.arrivalTime, p.choiceTime]) {
        expect(dist(p.positionAt(boundary - 1e-6), p.positionAt(boundary + 1e-6))).toBeLessThan(1e-3);
      }
      expect(p.arrivalTime).toBeLessThan(p.choiceTime);
      expect(p.choiceTime).toBeLessThan(p.endTime);
      expect(dist(p.positionAt(p.choiceTime), p.choicePose)).toBeLessThan(tuning.encounterStep * 6);
      expect(p.positionAt(p.endTime)).toEqual(p.afterPose);
    });
  });

  describe('earliest allowed commitment', () => {
    const rule = { stopRule: { mode: 'constant', length: 1 } as const, keepFactor: 0.75 };

    it('a commit below the lowest is raised to it', () => {
      const eager = plan({ offset: 0.5, commit: 0 }, rule);
      expect(eager.lowestCommit).toBeGreaterThan(0);
      const atLowest = plan({ offset: 0.5, commit: eager.lowestCommit }, rule);
      expect(eager.choicePose).toEqual(atLowest.choicePose);
      expect(eager.endTime).toBe(atLowest.endTime);
    });

    it('marks the earliest choice point on the encounter path, and a later commit passes it', () => {
      const p = plan({ offset: 0.5, commit: 1 }, rule);
      expect(p.encounterPath).toContainEqual(p.lowestCommitPose);
      const eager = plan({ offset: 0.5, commit: 0 }, rule);
      expect(eager.choicePose).toEqual(eager.lowestCommitPose);
      expect(p.encounterPath.length).toBeGreaterThan(eager.encounterPath.length);
    });

    it('is 0 with the limit turned off', () => {
      expect(plan({ offset: 0.5, commit: 0 }, { keepFactor: 0 }).lowestCommit).toBe(0);
    });
  });

  describe('reach shape', () => {
    const p = plan({ offset: 0.5, commit: 0.8 });

    it('starts at the after pose and runs off the viewBox', () => {
      expect(p.reachShape[0]).toMatchObject({ x: p.afterPose.x, y: p.afterPose.y });
      const reach = Math.max(...p.reachShape.map((q) => dist(q, p.afterPose)));
      expect(reach).toBeGreaterThan(10);
    });

    it('with no gravity matches the plain steering reach', () => {
      const free = plan({ offset: 0.5, commit: 0.8 }, { massScale: 0 });
      const plain = reachShape(free.afterPose, { ...tuning, massScale: 0 });
      const wide = (pts: { x: number; y: number }[], sign: number) =>
        pts.reduce((m, q) => (sign * q.x > sign * m.x ? q : m));
      for (const sign of [1, -1]) {
        expect(dist(wide(free.reachShape, sign), wide(plain, sign))).toBeLessThan(0.3);
      }
    });

    it('the planet keeps pulling: the shape bends toward it', () => {
      const free = plan({ offset: 0.5, commit: 0.8 }, { massScale: 5 });
      const none = plan({ offset: 0.5, commit: 0.8 }, { massScale: 0 });
      const centre = planet.positionAt(free.endTime);
      const spread = (pts: { x: number; y: number }[]) => Math.max(...pts.map((q) => dist(q, centre)));
      expect(free.reachShape).not.toEqual(none.reachShape);
      expect(spread(free.reachShape)).toBeLessThan(spread(none.reachShape));
    });
  });
});

describe('flightPlan: the approach scheme', () => {
  const aplan = (controls: { offset: number; curvature: number } = { offset: 0.5, curvature: 0.3 }, over: Partial<Tuning> = {}) =>
    flightPlan({ ship, time: 0, system, target: 0, controls: { scheme: 'approach', ...controls }, pinnedArrival, tuning: { ...tuning, ...over } });

  it('arrives when the curvature route does: the arrival time is re-solved, not pinned', () => {
    const solved = solveApproachByCurvature({ pose: ship, time: 0, planet, offset: 0.5, kappa: 0.3, tuning })!;
    const p = aplan()!;
    expect(p.valid).toBe(true);
    expect(p.arrivalTime).toBeCloseTo(solved.arrivalTime, 9);
    expect(p.route.at(-1)).toEqual(solved.entryPoint);
    expect(dist(p.positionAt(p.arrivalTime), solved.entryPoint)).toBeLessThan(1e-9);
    // a different curvature is a different route and a different arrival
    const q = aplan({ offset: 0.5, curvature: 0.6 })!;
    expect(q.arrivalTime).not.toBeCloseTo(p.arrivalTime, 3);
    expect(q.route).not.toEqual(p.route);
  });

  it('runs the encounter in the frame of the actual arrival heading, with the planet where it is at arrival', () => {
    const p = aplan()!;
    const there = planet.positionAt(p.arrivalTime);
    // the entry is offset to the side and encounterStart short of the planet, whatever the heading
    expect(dist(p.encounterPath[0], there)).toBeCloseTo(Math.hypot(0.5, tuning.encounterStart), 6);
    const solved = solveApproachByCurvature({ pose: ship, time: 0, planet, offset: 0.5, kappa: 0.3, tuning })!;
    expect(p.encounterPath[0].heading).toBeCloseTo(solved.arrivalHeading, 6);
  });

  it('applies the fixed commitment: the lowest allowed, or a number', () => {
    const rule = { stopRule: { mode: 'constant', length: 1 } as const, keepFactor: 0.75 };
    const lowest = aplan(undefined, { ...rule, fixedCommitment: 'lowest' })!;
    expect(lowest.choicePose).toEqual(lowest.lowestCommitPose);
    const late = aplan(undefined, { ...rule, fixedCommitment: 1 })!;
    expect(late.encounterPath.length).toBeGreaterThan(lowest.encounterPath.length);
    // a number below the lowest is raised to it, as in the other scheme
    const low = aplan(undefined, { ...rule, fixedCommitment: 0 })!;
    expect(low.choicePose).toEqual(low.lowestCommitPose);
  });

  it('keeps the stop, after pose and reach shape', () => {
    const p = aplan()!;
    expect(p.stopPath[0]).toEqual(p.choicePose);
    expect(p.stopPath.at(-1)).toEqual(p.afterPose);
    expect(p.positionAt(p.endTime)).toEqual(p.afterPose);
    expect(p.reachShape[0]).toMatchObject({ x: p.afterPose.x, y: p.afterPose.y });
  });

  it('is null when the planet cannot be reached', () => {
    expect(aplan(undefined, { shipSpeed: 0.001 })).toBeNull();
  });
});
