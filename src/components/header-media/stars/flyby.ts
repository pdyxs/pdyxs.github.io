import type { Point } from './types';

/** Heading (degrees clockwise from straight up) of the vector from→to. */
export function headingBetween(from: Point, to: Point): number {
  return (Math.atan2(to.x - from.x, -(to.y - from.y)) * 180) / Math.PI;
}

export type FlybyTuning = {
  /** Cone width for a far fly-by (drag offset 0). */
  farCone: number;
  /** Cone width for the closest fly-by (drag offset ±1). */
  closeCone: number;
  /** How far the closest fly-by bends the heading, in degrees. */
  maxTurn: number;
};

export type Flyby = {
  /** Heading the ship leaves the planet on. */
  heading: number;
  /** Full angle of the cone it then has to choose from. */
  coneAngle: number;
};

/**
 * What a fly-by does to the ship, given how the user has dragged sideways.
 *
 * `offset` is the drag in [-1, 1]: 0 is a far pass (a plain click), which
 * leaves the ship pointing the way it arrived; towards ±1 the pass gets
 * closer, the planet bends the heading harder to that side, and the cone
 * widens. The bend is steep near 0 — most of the range of outcomes is
 * within a small drag — so it goes as the square root of the offset.
 * Beyond ±1 the drag is out of range and the move is off: null.
 */
export function flyby(
  offset: number,
  incomingHeading: number,
  tuning: FlybyTuning,
): Flyby | null {
  const size = Math.abs(offset);
  if (size > 1) return null;

  const closeness = Math.sqrt(size);
  const turn = Math.sign(offset) * closeness * tuning.maxTurn;
  return {
    heading: incomingHeading + turn,
    coneAngle: tuning.farCone + (tuning.closeCone - tuning.farCone) * closeness,
  };
}
