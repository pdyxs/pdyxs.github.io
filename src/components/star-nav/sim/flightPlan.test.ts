import { describe, it, expect } from 'vitest';
import { flightPlan } from './flightPlan';
import { planApproach } from './approach';
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

const plan = (controls = { offset: 0.5, commit: 0.5 }, over: Partial<Tuning> = {}) =>
  flightPlan({ ship, time: 0, system, target: 0, controls, pinnedArrival, tuning: { ...tuning, ...over } })!;

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
