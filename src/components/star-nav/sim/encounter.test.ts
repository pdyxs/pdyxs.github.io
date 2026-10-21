import { describe, it, expect } from 'vitest';
import { simulateEncounter, poseAtCommitment } from './encounter';
import { defaultTuning, type Tuning } from './tuning';
import { advance } from './gravity';

const tuning: Tuning = { ...defaultTuning };
const dist = (s: { x: number; y: number }) => Math.hypot(s.x, s.y);

describe('simulateEncounter', () => {
  it('starts at (offset, -encounterStart) travelling +y at shipSpeed', () => {
    const e = simulateEncounter(-0.5, 0.3, tuning);
    const s = e.samples[0];
    expect(s).toMatchObject({ t: 0, x: -0.5, y: -tuning.encounterStart, vx: 0, vy: tuning.shipSpeed });
  });

  it('finds entry and exit indexes at the slingshot radius', () => {
    const e = simulateEncounter(-0.5, 0.3, tuning);
    expect(e.entryIndex).toBeLessThan(e.exitIndex);
    expect(dist(e.samples[e.entryIndex])).toBeLessThanOrEqual(tuning.slingshotRadius);
    expect(dist(e.samples[e.entryIndex - 1])).toBeGreaterThan(tuning.slingshotRadius);
    expect(dist(e.samples[e.exitIndex])).toBeLessThanOrEqual(tuning.slingshotRadius);
    expect(dist(e.samples[e.exitIndex + 1])).toBeGreaterThan(tuning.slingshotRadius);
  });

  it('bends towards the planet, and the sign flips with the side of the pass', () => {
    const left = simulateEncounter(-0.5, 0.3, tuning);
    const right = simulateEncounter(0.5, 0.3, tuning);
    expect(left.samples.at(-1)!.heading).toBeGreaterThan(0); // clockwise, to the right
    expect(right.samples.at(-1)!.heading).toBeCloseTo(-left.samples.at(-1)!.heading, 6);
  });

  it('bends more for a larger mu or a smaller offset', () => {
    const bend = (b: number, mu: number) => simulateEncounter(-b, mu, tuning).samples.at(-1)!.heading;
    expect(bend(0.5, 0.6)).toBeGreaterThan(bend(0.5, 0.3));
    expect(bend(0.3, 0.3)).toBeGreaterThan(bend(0.8, 0.3));
  });

  it('matches the analytic deflection 2·atan(mu / (b·v²)) for a far pass', () => {
    const far: Tuning = {
      ...tuning, encounterStart: 300, slingshotRadius: 300, encounterStep: 0.01, gravitySoftening: 0.001,
    };
    const b = 1, mu = 0.2, v0 = far.shipSpeed;
    const e = simulateEncounter(-b, mu, far);
    const vInf2 = v0 * v0 + (2 * mu) / Math.hypot(b, far.encounterStart);
    const expected = (2 * Math.atan(mu / (b * vInf2)) * 180) / Math.PI;
    // The simulation stops once the ship is outside the slingshot radius.
    expect(e.samples.at(-1)!.heading).toBeGreaterThan(expected * 0.97);
    expect(e.samples.at(-1)!.heading).toBeLessThan(expected * 1.03);
  });

  it('conserves speed through gravity only to the extent energy does (speed returns after the pass)', () => {
    const e = simulateEncounter(-0.5, 0.3, tuning);
    const last = e.samples.at(-1)!;
    expect(Math.hypot(last.vx, last.vy)).toBeCloseTo(tuning.shipSpeed, 1);
  });

  it('uses the same integrator step as advance()', () => {
    const e = simulateEncounter(-0.5, 0.3, tuning);
    const n = advance(e.samples[0], tuning.encounterStep, 0.3, tuning);
    expect(e.samples[1]).toEqual(n);
  });
});

describe('poseAtCommitment', () => {
  const enc = simulateEncounter(-0.5, 0.4, tuning);
  const total = enc.samples.at(-1)!.heading;

  it('0 is at the slingshot radius with almost no bend', () => {
    const p = poseAtCommitment(enc, 0);
    expect(dist(p)).toBeLessThanOrEqual(tuning.slingshotRadius);
    expect(dist(p)).toBeGreaterThan(tuning.slingshotRadius - 0.05);
    expect(Math.abs(p.heading)).toBeLessThan(0.25 * total);
  });

  it('1 is back at the slingshot radius with the whole bend done', () => {
    const p = poseAtCommitment(enc, 1);
    expect(dist(p)).toBeLessThanOrEqual(tuning.slingshotRadius);
    expect(dist(p)).toBeGreaterThan(tuning.slingshotRadius - 0.05);
    expect(p.heading).toBeGreaterThan(0.9 * total);
  });

  it('bend rises monotonically between', () => {
    let prev = -Infinity;
    for (let c = 0; c <= 1.0001; c += 0.05) {
      const h = poseAtCommitment(enc, c).heading;
      expect(h).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = h;
    }
  });

  it('clamps commitment outside [0, 1]', () => {
    expect(poseAtCommitment(enc, -1)).toEqual(poseAtCommitment(enc, 0));
    expect(poseAtCommitment(enc, 2)).toEqual(poseAtCommitment(enc, 1));
  });
});
