import { advance, type Sample } from './gravity';
import { poseAtCommitment, type Encounter } from './encounter';
import type { StopRule, Tuning } from './tuning';

/** How long a stop lasts, given the ship's distance from the planet when it begins. */
export function stopLength(rule: StopRule, distance: number): number {
  switch (rule.mode) {
    case 'none': return 0;
    case 'constant': return rule.length;
    case 'distance': return rule.perUnit * distance;
  }
}

/**
 * Drift with no steering for `duration`, gravity still acting. Returns every
 * step from `pose` (first) to the end (last); the last step is shortened so the
 * path lasts exactly `duration`.
 */
export function coast(pose: Sample, duration: number, mu: number, tuning: Tuning): Sample[] {
  const path: Sample[] = [pose];
  const end = pose.t + duration;
  let s = pose;
  while (end - s.t > 1e-12) {
    s = advance(s, Math.min(tuning.encounterStep, end - s.t), mu, tuning);
    path.push(s);
  }
  return path;
}

export type AfterStop = {
  /** Where the stop begins. */
  choice: Sample;
  stopLength: number;
  /** The drift during the stop, from `choice` to `steerStart`. */
  stopPath: Sample[];
  /** Where steering resumes. */
  steerStart: Sample;
};

/** The stop that follows a choice at commitment `c`. */
export function afterStop(
  encounter: Encounter,
  c: number,
  rule: StopRule,
  mu: number,
  tuning: Tuning,
): AfterStop {
  const choice = poseAtCommitment(encounter, c);
  const length = stopLength(rule, Math.hypot(choice.x, choice.y));
  const stopPath = coast(choice, length, mu, tuning);
  return { choice, stopLength: length, stopPath, steerStart: stopPath[stopPath.length - 1] };
}

/**
 * The smallest commitment whose choice point is no further before the planet
 * (along local +y) than `keepFactor * stopLength`. Falls back to 1 if none is.
 */
export function lowestCommitment(
  encounter: Encounter,
  rule: StopRule,
  keepFactor: number,
  _mu: number,
  _tuning: Tuning,
): number {
  if (keepFactor <= 0) return 0;
  const { entryIndex, exitIndex, samples } = encounter;
  for (let i = entryIndex; i <= exitIndex; i++) {
    const s = samples[i];
    if (s.y >= -keepFactor * stopLength(rule, Math.hypot(s.x, s.y))) {
      return exitIndex === entryIndex ? 0 : (i - entryIndex) / (exitIndex - entryIndex);
    }
  }
  return 1;
}
