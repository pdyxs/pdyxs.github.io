import type { Planet } from '../planet';
import type { Point, Pose } from '../types';
import { headingBetween } from './route';
import { steerPath, type Side } from './steering';
import type { Tuning } from './tuning';

const RAD = Math.PI / 180;
const TAU = Math.PI * 2;

export type CurvedRoute = {
  /** Points of the arc then the straight leg, ship to target. */
  points: Point[];
  length: number;
  /** Degrees clockwise from up: the heading of the straight leg. */
  arrivalHeading: number;
};

/**
 * The route from `pose` to `target`: an arc of curvature `kappa` (0 to
 * 1/turnRadius) towards the side the target is on, then the tangent line
 * through the target. Null when the target is inside the turning circle.
 * kappa = 0 is the straight line.
 */
export function routeWithCurvature(
  pose: Pose,
  target: Point,
  kappa: number,
  tuning: Tuning,
): CurvedRoute | null {
  const h = pose.heading * RAD;
  const dx = target.x - pose.x;
  const dy = target.y - pose.y;
  const forward = dx * Math.sin(h) - dy * Math.cos(h);
  const right = dx * Math.cos(h) + dy * Math.sin(h);

  if (kappa <= 0) {
    // keep the heading within a half turn of the ship's, so it stays continuous with kappa > 0
    let heading = headingBetween(pose, target);
    heading -= 360 * Math.round((heading - pose.heading) / 360);
    return {
      points: [{ x: pose.x, y: pose.y }, { ...target }],
      length: Math.hypot(dx, dy),
      arrivalHeading: heading,
    };
  }

  const rho = 1 / kappa;
  const side: Side = right >= 0 ? 'right' : 'left';
  const s = side === 'right' ? 1 : -1;
  // frame with the circle's centre at (rho, 0) and the turn towards +a
  const a = s * right - rho;
  const d = Math.hypot(a, forward);
  if (d < rho) return null;

  let phi = Math.PI - Math.atan2(forward, a) - Math.acos(rho / d);
  phi -= TAU * Math.floor(phi / TAU);
  const tangent = Math.sqrt(d * d - rho * rho);
  const length = rho * phi + tangent;

  const points = steerPath(pose, side, phi / RAD, { ...tuning, turnRadius: rho }, length);
  points[points.length - 1] = { ...target };
  return { points, length, arrivalHeading: pose.heading + s * (phi / RAD) };
}

export type CurvatureApproach = {
  route: CurvedRoute;
  arrivalTime: number;
  arrivalHeading: number;
  /** Where the slingshot encounter begins, on the incoming line. */
  entryPoint: Point;
};

export type CurvatureApproachInput = {
  pose: Pose;
  /** Orbit time now. */
  time: number;
  planet: Planet;
  /** Signed lateral distance of the incoming line from the planet; negative passes on its left. */
  offset: number;
  kappa: number;
  tuning: Tuning;
};

// Iterations of the entry point <-> arrival heading fixed point.
const FIXED_POINT_STEPS = 40;

/** The unit vector of heading h (degrees clockwise from up). */
const along = (h: number): Point => ({ x: Math.sin(h * RAD), y: -Math.cos(h * RAD) });
/** The unit vector perpendicular to heading h, on the ship's right. */
const normal = (h: number): Point => ({ x: Math.cos(h * RAD), y: Math.sin(h * RAD) });

/**
 * Entry point and route for a planet at `planet`: E = P + offset·n(h) −
 * h_dir·encounterStart, where h is the heading the route to E arrives on.
 * E depends on h and h on E, so iterate from the heading straight at P.
 */
function routeToEntry(input: CurvatureApproachInput, planetPos: Point) {
  const { pose, offset, kappa, tuning } = input;
  let h = headingBetween(pose, planetPos);
  let found: { route: CurvedRoute; entryPoint: Point } | null = null;
  for (let i = 0; i < FIXED_POINT_STEPS; i++) {
    const n = normal(h);
    const d = along(h);
    const entryPoint = {
      x: planetPos.x + offset * n.x - d.x * tuning.encounterStart,
      y: planetPos.y + offset * n.y - d.y * tuning.encounterStart,
    };
    const route = routeWithCurvature(pose, entryPoint, kappa, tuning);
    if (route === null) return null;
    found = { route, entryPoint };
    const converged = Math.abs(route.arrivalHeading - h) < 1e-10;
    h = route.arrivalHeading;
    if (converged) break;
  }
  return found;
}

/**
 * The earliest arrival at the entry point of a slingshot at `planet`, flying
 * the curvature route. The planet is not pinned: a longer route arrives later,
 * with the planet further round its orbit. Finds the first t within
 * `maxOrbits` orbits where shipSpeed·(t − time) reaches the route length, by
 * scanning for the first sign change of the gap and bisecting, as planApproach
 * does. Null if none, or if the entry point is unreachable.
 */
export function solveApproachByCurvature(
  input: CurvatureApproachInput,
  maxOrbits = 4,
): CurvatureApproach | null {
  const { time, planet, tuning } = input;
  const at = (T: number) => routeToEntry(input, planet.positionAt(time + T));
  const gap = (T: number) => {
    const r = at(T);
    return r === null ? Infinity : r.route.length - tuning.shipSpeed * T;
  };

  const step = planet.period / 128;
  const limit = planet.period * maxOrbits;

  let lo = 0;
  for (let hi = step; hi <= limit; hi += step) {
    if (gap(lo) > 0 && gap(hi) <= 0) {
      let a = lo, b = hi;
      for (let i = 0; i < 50; i++) {
        const mid = (a + b) / 2;
        if (gap(mid) > 0) a = mid; else b = mid;
      }
      // a flip at the edge of the reachable region is not an arrival
      if (Math.abs(gap(b)) < 1e-3) {
        const r = at(b)!;
        return {
          route: r.route,
          arrivalTime: time + b,
          arrivalHeading: r.route.arrivalHeading,
          entryPoint: r.entryPoint,
        };
      }
    }
    lo = hi;
  }
  return null;
}
