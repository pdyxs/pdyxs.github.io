import type { Point } from '../types';
import { headingBetween } from './route';
import type { Tuning } from './tuning';
import type { ApproachControls, CommitmentControls, Controls } from './flightPlan';

const RAD = Math.PI / 180;

/**
 * The axes of a drag, fixed when the pointer goes down: the direction the
 * ship approaches the planet, and the limits the drag works within.
 */
export type DragFrame = {
  /** Degrees clockwise from up: the straight way from the ship to the intercept. */
  heading: number;
  /** Width of the drawing in px; the drag range is a fraction of it. */
  boxWidth: number;
  /** Drags shorter than this (px) are ignored. */
  deadZone: number;
  /** The closest pass: the planet's radius. */
  minOffset: number;
  /** The earliest commitment the plan allows. */
  lowestCommit: number;
};

/** The frame for a drag that starts at `ship`, aimed at the zero-offset intercept. */
export function approachFrame(
  ship: Point,
  intercept: Point,
  rest: Omit<DragFrame, 'heading'>,
): DragFrame {
  return { heading: headingBetween(ship, intercept), ...rest };
}

/** The drag split on the frame's axes, in px: across the approach and along it. */
function axesOf(drag: Point, frame: DragFrame, range: number) {
  const h = frame.heading * RAD;
  const ignored = Math.hypot(drag.x, drag.y) < frame.deadZone || !(range > 0);
  return {
    across: ignored ? 0 : drag.x * Math.cos(h) + drag.y * Math.sin(h),
    along: ignored ? 0 : drag.x * Math.sin(h) - drag.y * Math.cos(h),
  };
}

/** The pass: the side the drag is on, scaled by the drag range, within the frame's limits. */
function passOffset(across: number, range: number, frame: DragFrame, tuning: Tuning): number {
  const size = Math.min(tuning.maxOffset, Math.max(frame.minOffset, (range > 0 ? (Math.abs(across) / range) * tuning.maxOffset : 0)));
  return across < 0 ? -size : size;
}

/** `commitment` scheme: along the approach is the commitment, forward is more. */
function commitmentControls(across: number, along: number, range: number, frame: DragFrame, tuning: Tuning): CommitmentControls {
  const commit = tuning.defaultCommit + (range > 0 ? along / range : 0);
  return {
    scheme: 'commitment',
    offset: passOffset(across, range, frame, tuning),
    commit: Math.min(1, Math.max(frame.lowestCommit, commit)),
  };
}

/**
 * `approach` scheme: along the approach is the route's curvature, from 0 to
 * 1/turnRadius, neutral at half; one drag range from neutral spans all of it.
 */
function approachControls(across: number, along: number, range: number, frame: DragFrame, tuning: Tuning): ApproachControls {
  const sign = tuning.curvatureDirection === 'up-is-less' ? -1 : 1;
  const fraction = 0.5 + (range > 0 ? (sign * along) / (2 * range) : 0);
  return {
    scheme: 'approach',
    offset: passOffset(across, range, frame, tuning),
    curvature: Math.min(1, Math.max(0, fraction)) / tuning.turnRadius,
  };
}

/**
 * A pointer drag (px, y down) as the plan's controls, for the tuning's control
 * scheme. Across the approach always sets the pass; along it sets the
 * commitment or the curvature.
 */
export function dragToControls(drag: Point, frame: DragFrame, tuning: Tuning): Controls {
  const range = tuning.dragRange * frame.boxWidth;
  const { across, along } = axesOf(drag, frame, range);
  return tuning.controlScheme === 'approach'
    ? approachControls(across, along, range, frame, tuning)
    : commitmentControls(across, along, range, frame, tuning);
}

/**
 * Whether a pointer movement is a drag rather than a tap: it has gone
 * somewhere, and at least as far as the dead zone.
 */
export function isDrag(drag: Point, frame: DragFrame): boolean {
  const distance = Math.hypot(drag.x, drag.y);
  return distance > 0 && distance >= frame.deadZone;
}
