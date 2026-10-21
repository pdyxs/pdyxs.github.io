import type { Point } from '../types';
import { headingBetween } from './route';
import type { Tuning } from './tuning';
import type { Controls } from './flightPlan';

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

/**
 * A pointer drag (px, y down) as the plan's controls. Across the approach
 * sets the pass: the side the drag is on, scaled by the drag range, at least
 * the planet's radius and at most `maxOffset`. Along it sets the commitment:
 * forward is more, back is less, between the frame's lowest and 1.
 */
export function dragToControls(drag: Point, frame: DragFrame, tuning: Tuning): Controls {
  const range = tuning.dragRange * frame.boxWidth;
  const h = frame.heading * RAD;
  const ignored = Math.hypot(drag.x, drag.y) < frame.deadZone || !(range > 0);
  const across = ignored ? 0 : drag.x * Math.cos(h) + drag.y * Math.sin(h);
  const along = ignored ? 0 : drag.x * Math.sin(h) - drag.y * Math.cos(h);

  const size = Math.min(tuning.maxOffset, Math.max(frame.minOffset, (Math.abs(across) / range) * tuning.maxOffset));
  const commit = tuning.defaultCommit + (range > 0 ? along / range : 0);
  return {
    offset: across < 0 ? -size : size,
    commit: Math.min(1, Math.max(frame.lowestCommit, commit)),
  };
}
