import { describe, expect, it } from 'vitest';
import { forces } from '../../../../../lib/particulars/sim/forces';
import type { ParticleSnapshot, Snapshot } from '../../../../../lib/particulars/sim/snapshot';
import { BLOB_POINTS, GROW_SECONDS, MIN_RADIUS } from './constants';
import { blobBodies, blobOutlines, blobRadius, growScale, pairForce, PLAYER_BLOB_ID, spreadForce, type BlobBody } from './shape';

const ALL_ON = { em: true, strong: true, weak: false, gravity: true } as never;

function body(over: Partial<BlobBody>): BlobBody {
  return { id: 0, x: 0, y: 0, zero: 0.5, parity: 1, type: 'up', colour: 'red', ...over };
}

function particle(over: Partial<ParticleSnapshot>): ParticleSnapshot {
  return { id: 0, type: 'up', colour: 'red', parity: 1, x: 0, y: 0, radius: 0.53, live: true, vx: 0, vy: 0, ...over };
}

function snapshot(particles: ParticleSnapshot[], alive = true): Snapshot {
  return {
    tick: 0,
    walls: { width: 20, height: 10 },
    player: { x: 5, y: 5, radius: 0.35, type: 'electron', colour: 'white', parity: -1, alive, vx: 0, vy: 0, steer: { x: 0, y: 0 } },
    particles,
    blackHoles: [],
    barriers: [],
    forces: ALL_ON,
    explosions: [],
    pickupsEnabled: false,
    pickups: [],
    collected: 0,
  };
}

describe('blobBodies', () => {
  it('gives the living player and every live particle a blob, and skips telegraphs', () => {
    const out: BlobBody[] = [];
    const n = blobBodies(snapshot([particle({ id: 3 }), particle({ id: 4, live: false })]), 10, () => 0, out);
    expect(n).toBe(2);
    expect(out[0].id).toBe(PLAYER_BLOB_ID);
    expect(out[1].id).toBe(3);
    expect(out[1].zero).toBeCloseTo(0.53);
  });

  it('drops a dead player', () => {
    const n = blobBodies(snapshot([], false), 10, () => 0, []);
    expect(n).toBe(0);
  });

  it('grows a new blob in from nothing', () => {
    const out: BlobBody[] = [];
    blobBodies(snapshot([particle({ id: 1 })]), 1, () => 1, out);
    expect(out[1].zero).toBe(0);
    expect(growScale(GROW_SECONDS / 2)).toBeCloseTo(0.125);
    expect(growScale(GROW_SECONDS)).toBe(1);
  });
});

describe('pairForce', () => {
  it('matches the sim along the line between two particles', () => {
    const cases: [Partial<ParticleSnapshot>, Partial<ParticleSnapshot>][] = [
      [{ type: 'up', colour: 'red', parity: 1 }, { type: 'down', colour: 'red', parity: -1 }],
      [{ type: 'up', colour: 'red', parity: 1 }, { type: 'down', colour: 'green', parity: 1 }],
      [{ type: 'up', colour: 'blue', parity: 1 }, { type: 'up', colour: 'blue', parity: 1 }],
      [{ type: 'electron', colour: 'white', parity: 1 }, { type: 'up', colour: 'green', parity: -1 }],
    ];
    for (const [ao, bo] of cases) {
      const a = particle({ id: 1, x: 0, y: 0, ...ao });
      const b = particle({ id: 2, x: 1.7, y: 0, ...bo });
      const [fa] = forces({ particles: [a, b], blackHoles: [] }, ALL_ON);
      // the sim's force on a, along a − b (+x is toward b, so −x is away)
      const away = -fa.x;
      expect(pairForce(body(a), body(b), 1.7, ALL_ON)).toBeCloseTo(away, 6);
    }
  });
});

describe('spreadForce', () => {
  it('peaks at the force direction and falls to zero 60° away', () => {
    const ring = new Float32Array(BLOB_POINTS);
    spreadForce(ring, 0, 0, 10);
    expect(ring[0]).toBeCloseTo(10);
    expect(ring[BLOB_POINTS / 4]).toBe(0);
    expect(ring[1]).toBeCloseTo(ring[BLOB_POINTS - 1]);
    expect(ring[1]).toBeLessThan(10);
  });

  it('wraps across angle zero for negative angles', () => {
    const ring = new Float32Array(BLOB_POINTS);
    spreadForce(ring, 0, -Math.PI / 2, 1);
    expect(ring[(BLOB_POINTS * 3) / 4]).toBeCloseTo(1);
  });
});

describe('blobRadius', () => {
  it('is the zero point with no force, up to double under a big pull, down to the minimum under a big push', () => {
    expect(blobRadius(0, 0.5)).toBe(0.5);
    expect(blobRadius(1e9, 0.5)).toBeCloseTo(1 - MIN_RADIUS, 3);
    expect(blobRadius(-1e9, 0.5)).toBeCloseTo(MIN_RADIUS, 3);
  });
});

describe('blobOutlines', () => {
  it('stretches two attracting quarks toward each other — the rubber band', () => {
    const bodies = [
      body({ id: 1, x: 0, y: 0, colour: 'red', parity: 1 }),
      body({ id: 2, x: 2, y: 0, colour: 'red', parity: -1, type: 'down' }),
    ];
    const ring = new Float32Array(2 * BLOB_POINTS);
    const radii = new Float32Array(2 * BLOB_POINTS);
    blobOutlines(bodies, 2, [], { em: false, strong: true, weak: false, gravity: false } as never, ring, radii);
    // body 1 bulges along +x (toward 2), body 2 along −x (index BLOB_POINTS/2)
    expect(radii[0]).toBeGreaterThan(0.5);
    expect(radii[BLOB_POINTS / 2]).toBeCloseTo(0.5);
    expect(radii[BLOB_POINTS + BLOB_POINTS / 2]).toBeGreaterThan(0.5);
  });

  it('dents a blob toward what repels it', () => {
    const bodies = [body({ id: 1, x: 0, y: 0 }), body({ id: 2, x: 0, y: 2 })];
    const ring = new Float32Array(2 * BLOB_POINTS);
    const radii = new Float32Array(2 * BLOB_POINTS);
    blobOutlines(bodies, 2, [], { em: false, strong: true, weak: false, gravity: false } as never, ring, radii);
    expect(radii[BLOB_POINTS / 4]).toBeLessThan(0.5);
  });
});
