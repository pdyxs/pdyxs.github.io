import { advance, makeSample, type Sample } from './gravity';
import type { Tuning } from './tuning';

/**
 * A simulated pass, in the local frame: planet at the origin, ship arriving
 * travelling +y. `entryIndex` / `exitIndex` bracket the time spent inside the
 * slingshot radius.
 */
export type Encounter = {
  samples: Sample[];
  entryIndex: number;
  exitIndex: number;
};

/**
 * Integrates a pass at lateral `offset` (negative: planet on the ship's right)
 * under a planet of gravitational parameter `mu`. Ship speed is the tuning's
 * `shipSpeed` on arrival; the planet's own motion is ignored.
 */
export function simulateEncounter(offset: number, mu: number, tuning: Tuning): Encounter {
  const { encounterStep: dt, encounterStart, slingshotRadius, shipSpeed } = tuning;
  const radius = (s: Sample) => Math.hypot(s.x, s.y);
  const samples: Sample[] = [makeSample(0, offset, -encounterStart, 0, shipSpeed)];

  const nominal = (2 * (encounterStart + slingshotRadius)) / shipSpeed / dt;
  const maxSteps = Math.ceil(nominal * 4) + 1000;
  let passed = false;
  for (let i = 0; i < maxSteps; i++) {
    const s = advance(samples[samples.length - 1], dt, mu, tuning);
    samples.push(s);
    if (s.x * s.vx + s.y * s.vy > 0) passed = true; // moving away
    if (passed && radius(s) > slingshotRadius * 1.1) break;
  }

  let entryIndex = samples.findIndex((s) => radius(s) <= slingshotRadius);
  if (entryIndex < 0) entryIndex = samples.length - 1; // never came within range
  let exitIndex = samples.length - 1;
  while (exitIndex > entryIndex && radius(samples[exitIndex]) > slingshotRadius) exitIndex--;
  return { samples, entryIndex, exitIndex };
}

/** The ship's pose at commitment `c` (0 on entry, 1 on exit), by time inside the radius. */
export function poseAtCommitment(encounter: Encounter, c: number): Sample {
  const { samples, entryIndex, exitIndex } = encounter;
  const clamped = Math.min(1, Math.max(0, c));
  return samples[entryIndex + Math.round(clamped * (exitIndex - entryIndex))];
}
