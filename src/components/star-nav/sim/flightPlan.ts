import type { Point, Pose } from '../types';
import type { StarSystem } from '../star_system';
import { afterStop, lowestCommitment } from './commitment';
import { gravityReachShape } from './gravityReach';
import { poseAtCommitment, simulateEncounter } from './encounter';
import type { Sample } from './gravity';
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
  /** Orbit time at which the encounter begins; the planet is pinned here. */
  arrivalTime: number;
  /** World path of the pass, entry to choice point. */
  encounterPath: Pose[];
  choicePose: Pose;
  /** World path of the stop, choice point to after pose. */
  stopPath: Pose[];
  afterPose: Pose;
  /** The smallest commitment the drag may reach, and where it puts the choice. */
  lowestCommit: number;
  lowestCommitPose: Pose;
  /** The region steering could reach from the after pose, the planet still pulling. */
  reachShape: Point[];
  /** Orbit time at which the stop ends. */
  endTime: number;
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

/** The pose at local time `t` along samples sorted by time, interpolated. */
function sampleAt(samples: { t: number; pose: Pose }[], t: number): Pose {
  if (t <= samples[0].t) return samples[0].pose;
  const last = samples[samples.length - 1];
  if (t >= last.t - 1e-9) return last.pose;
  let lo = 0, hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t <= t) lo = mid; else hi = mid;
  }
  const a = samples[lo], b = samples[hi];
  const f = (t - a.t) / (b.t - a.t);
  return {
    x: a.pose.x + (b.pose.x - a.pose.x) * f,
    y: a.pose.y + (b.pose.y - a.pose.y) * f,
    heading: a.pose.heading + (b.pose.heading - a.pose.heading) * f,
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

  // The pass, in the local frame, then carried with the planet.
  const mu = tuning.massScale * planet.mass;
  const encounter = simulateEncounter(controls.offset, mu, tuning);
  const lowest = lowestCommitment(encounter, tuning.stopRule, tuning.keepFactor, mu, tuning);
  const commit = Math.min(1, Math.max(lowest, controls.commit));
  const after = afterStop(encounter, commit, tuning.stopRule, mu, tuning);

  const earliest = poseAtCommitment(encounter, lowest);

  const place = (s: Sample): { t: number; pose: Pose } => {
    const at = toWorld(planet.positionAt(pinnedArrival + s.t), arrivalHeading, s);
    return { t: s.t, pose: { ...at, heading: arrivalHeading + s.heading } };
  };
  const encounterSamples = encounter.samples.filter((s) => s.t <= after.choice.t).map(place);
  const lowestCommitPose = place(earliest).pose;
  const stopSamples = after.stopPath.map(place);
  const timeline = [...encounterSamples, ...stopSamples.slice(1)];

  const endTime = pinnedArrival + after.steerStart.t;
  return {
    valid: steer !== null,
    route,
    arrivalTime: pinnedArrival,
    encounterPath: encounterSamples.map((s) => s.pose),
    choicePose: encounterSamples[encounterSamples.length - 1].pose,
    stopPath: stopSamples.map((s) => s.pose),
    afterPose: stopSamples[stopSamples.length - 1].pose,
    reachShape: gravityReachShape(after.steerStart, mu, tuning).map((q) =>
      toWorld(planet.positionAt(endTime), arrivalHeading, q)),
    lowestCommit: lowest,
    lowestCommitPose,
    endTime,
    positionAt(t) {
      if (t <= time) return { ...ship };
      if (t < pinnedArrival) return routeUpTo(route, (t - time) / (pinnedArrival - time)).pose;
      return { ...sampleAt(timeline, t - pinnedArrival) };
    },
  };
}
