import { describe, it, expect } from 'vitest';
import { steerPath, reachShape, steeringTo } from './steering';
import { defaultTuning, type Tuning } from './tuning';

const tuning: Tuning = { ...defaultTuning, shipSpeed: 2, turnRadius: 2, turnCap: 50 };
const origin = { x: 0, y: 0, heading: 0 };
const pathLength = (pts: { x: number; y: number }[]) =>
  pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);

describe('steerPath', () => {
  it('with no turn goes straight along the heading (heading 0 is up, -y)', () => {
    const pts = steerPath(origin, 'right', 0, tuning, 5);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts.at(-1)!.x).toBeCloseTo(0);
    expect(pts.at(-1)!.y).toBeCloseTo(-5);
  });

  it('turning right bends towards +x on a circle of the turn radius', () => {
    const pts = steerPath(origin, 'right', 90, tuning, 100);
    // After a quarter circle the ship is R across and R ahead, heading right.
    const quarter = pts.find((p) => Math.abs(p.x - 2) < 1e-6 && Math.abs(p.y + 2) < 1e-6);
    expect(quarter).toBeDefined();
    // Every arc point is R from the centre (2, 0).
    for (const p of pts.filter((p) => p.x <= 2 + 1e-9 && p.y <= 1e-9 && p.y >= -2 - 1e-9)) {
      expect(Math.hypot(p.x - 2, p.y)).toBeCloseTo(2);
    }
    // Then straight to the right.
    expect(pts.at(-1)!.y).toBeCloseTo(-2);
    expect(pts.at(-1)!.x).toBeGreaterThan(2);
  });

  it('turning left mirrors turning right', () => {
    const l = steerPath(origin, 'left', 30, tuning, 6);
    const r = steerPath(origin, 'right', 30, tuning, 6);
    expect(l.length).toBe(r.length);
    l.forEach((p, i) => { expect(p.x).toBeCloseTo(-r[i].x); expect(p.y).toBeCloseTo(r[i].y); });
  });

  it('has the requested total length', () => {
    expect(pathLength(steerPath(origin, 'left', 30, tuning, 3))).toBeCloseTo(3, 1);
    expect(pathLength(steerPath(origin, 'left', 30, tuning, 20))).toBeGreaterThan(19.9);
  });

  it('honours the pose', () => {
    const pts = steerPath({ x: 1, y: 1, heading: 90 }, 'left', 0, tuning, 2);
    expect(pts.at(-1)!.x).toBeCloseTo(3);
    expect(pts.at(-1)!.y).toBeCloseTo(1);
  });
});

describe('reachShape', () => {
  const shape = reachShape(origin, tuning);

  it('is a narrow neck: half-width at forward distance y is R - sqrt(R^2 - y^2)', () => {
    const near = shape.filter((p) => p.x !== 0 && -p.y < 1);
    expect(near.length).toBeGreaterThan(2);
    for (const p of near) {
      const y = -p.y;
      expect(Math.abs(p.x)).toBeCloseTo(2 - Math.sqrt(4 - y * y));
      expect(Math.abs(p.x)).toBeCloseTo(y * y / (2 * 2), 1);
    }
  });

  it('far away its edges run straight at the turn cap from the heading', () => {
    const far = shape.filter((p) => -p.y > 10);
    expect(far.length).toBeGreaterThan(0);
    const right = shape.reduce((a, b) => (b.x > a.x ? b : a));
    const left = shape.reduce((a, b) => (b.x < a.x ? b : a));
    expect(right.x).toBeGreaterThan(10);
    expect(left.x).toBeLessThan(-10);
    // straight section: slope between last two points on the right edge
    const rightEdge = shape.filter((p) => p.x > 0);
    const [b, a] = rightEdge.sort((p, q) => p.y - q.y).slice(0, 2);
    expect(Math.atan2(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) * 180 / Math.PI).toBeCloseTo(50);
  });

  it('extends further than the viewBox diagonal', () => {
    expect(Math.max(...shape.map((p) => Math.hypot(p.x, p.y)))).toBeGreaterThan(Math.hypot(10, 10));
  });
});

describe('steeringTo', () => {
  it('a point dead ahead needs no turn and is the straight distance away', () => {
    const plan = steeringTo(origin, { x: 0, y: -6 }, tuning)!;
    expect(plan.turnAmount).toBeCloseTo(0);
    expect(plan.length).toBeCloseTo(6);
  });

  it('a point off to one side is reached by turning towards it, ending on the point', () => {
    const target = { x: 4, y: -8 };
    const plan = steeringTo(origin, target, tuning)!;
    expect(plan.side).toBe('right');
    expect(plan.turnAmount).toBeGreaterThan(0);
    const pts = steerPath(origin, plan.side, plan.turnAmount, tuning, plan.length);
    expect(pts.at(-1)!.x).toBeCloseTo(4);
    expect(pts.at(-1)!.y).toBeCloseTo(-8);
  });

  it('a point beyond the turn cap, behind, or in the neck beside the ship is unreachable', () => {
    expect(steeringTo(origin, { x: 10, y: -2 }, tuning)).toBeNull(); // beyond cap
    expect(steeringTo(origin, { x: 0, y: 5 }, tuning)).toBeNull();   // behind
    expect(steeringTo(origin, { x: 0.5, y: -0.2 }, tuning)).toBeNull(); // in the neck
    expect(steeringTo(origin, { x: 1, y: 0 }, tuning)).toBeNull();   // beside, inside the turn circle
  });
});
