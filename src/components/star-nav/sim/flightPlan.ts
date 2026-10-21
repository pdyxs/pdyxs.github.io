import type { Point, Pose } from '../types';
import type { StarSystem } from '../star_system';
import { routeUpTo } from './route';
import { steerPath, steeringTo } from './steering';
import type { Tuning } from './tuning';

const RAD = Math.PI / 180;

/** What the player's drag decides. */
export type Controls = {
  /** Lateral distance of the pass: positive passes with the planet on the ship's left. */
  offset: number;
  /** 0-1: how much of the slingshot happens before the next choice. */
  commit: number;
};

export type FlightPlan = {
  valid: boolean;
  route: Point[];
  arrivalTime: number;
  positionAt(t: number): Pose;
};

export type FlightPlanInput = {
  ship: Pose;
  time: number;
  system: StarSystem;
  /** Index of the target planet in `system.planets`. */
  target: number;
  controls: Controls;
  /** Arrival time of the zero-offset plan; fixed for a whole gesture. */
  pinnedArrival: number;
  tuning: Tuning;
};

/**
 * A point of the local frame (planet at the origin, ship arriving along +y,
 * +x on the ship's right) placed in the world: rotated to the arrival
 * `heading` (degrees clockwise from up) and moved to `origin`.
 */
function toWorld(origin: Point, heading: number, local: Point): Point {
  const h = heading * RAD;
  return {
    x: origin.x + local.x * Math.cos(h) + local.y * Math.sin(h),
    y: origin.y + local.x * Math.sin(h) - local.y * Math.cos(h),
  };
}

export function flightPlan(input: FlightPlanInput): FlightPlan | null {
  const { ship, time, system, target, controls, pinnedArrival, tuning } = input;
  const planet = system.planets[target];
  const pinned = planet.positionAt(pinnedArrival);

  // The way the zero-offset plan arrives is the way every plan arrives.
  const straight = steeringTo(ship, pinned, tuning);
  if (!straight) return null;
  const arrivalHeading = ship.heading + (straight.side === 'right' ? 1 : -1) * straight.turnAmount;

  const entry = toWorld(pinned, arrivalHeading, { x: controls.offset, y: -tuning.encounterStart });
  const steer = steeringTo(ship, entry, tuning);
  const route = steer
    ? steerPath(ship, steer.side, steer.turnAmount, tuning, steer.length)
    : [{ x: ship.x, y: ship.y }, entry];
  route[route.length - 1] = entry;

  return {
    valid: steer !== null,
    route,
    arrivalTime: pinnedArrival,
    positionAt(t) {
      if (t <= time) return { ...ship };
      if (t >= pinnedArrival) return { ...entry, heading: arrivalHeading };
      return routeUpTo(route, (t - time) / (pinnedArrival - time)).pose;
    },
  };
}
