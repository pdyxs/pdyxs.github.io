import { describe, it, expect } from 'vitest';
import { forces } from './forces';
import type { ForceInput } from './forces';
import type { ForceSwitches } from '../scenario/types';
import type { ParticleSnapshot } from './snapshot';
import { massOf } from '../constants';

const OFF: ForceSwitches = { strong: false, weak: false, em: false, gravity: false };
const particle = (over: Partial<ParticleSnapshot>): ParticleSnapshot => ({
  id: 0, type: 'electron', colour: 'white', parity: 1, x: 0, y: 0, radius: 0.35, live: true, ...over,
});
const input = (particles: ParticleSnapshot[], blackHoles: ForceInput['blackHoles'] = []): ForceInput => ({
  particles,
  blackHoles,
});

describe('forces: electromagnetism', () => {
  // Force = 500 * 0.02 * q1 * q2 / d (the original's per-step strength); charges in thirds: electron -3, positron +3, up +2.
  it('opposite charges attract: F = k*q1*q2/d along the line between them', () => {
    const pair = input([particle({ id: 0, type: 'electron', x: 0 }), particle({ id: 1, type: 'up', x: 4 })]);
    // q1*q2 = -6, d = 4 => magnitude 10*6/4 = 15, toward the other.
    const [a, b] = forces(pair, { ...OFF, em: true });
    expect(a.x).toBeCloseTo(15, 10);
    expect(a.y).toBeCloseTo(0, 10);
    expect(b.x).toBeCloseTo(-15, 10);
  });

  it('like charges repel; antiparticle parity flips the sign', () => {
    // electron (-3) and electron (-3): q1*q2 = 9, d = 3 => 10*9/3 = 30 apart.
    const [a, b] = forces(input([particle({ id: 0, x: 0 }), particle({ id: 1, x: 3 })]), { ...OFF, em: true });
    expect(a.x).toBeCloseTo(-30, 10);
    expect(b.x).toBeCloseTo(30, 10);
    // positron (+3) with electron (-3): attract.
    const [c] = forces(input([particle({ id: 0, x: 0, parity: -1 }), particle({ id: 1, x: 3 })]), { ...OFF, em: true });
    expect(c.x).toBeCloseTo(30, 10);
  });

  it('works along any direction (3-4-5): d = 5, q1*q2 = -6 => 12 toward the other', () => {
    const [a] = forces(input([particle({ id: 0, type: 'up' }), particle({ id: 1, x: 3, y: 4 })]), { ...OFF, em: true });
    expect(a.x).toBeCloseTo(12 * 0.6, 10);
    expect(a.y).toBeCloseTo(12 * 0.8, 10);
  });

  it('does nothing when switched off', () => {
    const acc = forces(input([particle({ id: 0, x: 0 }), particle({ id: 1, type: 'up', x: 4 })]), OFF);
    expect(acc).toEqual([{ x: 0, y: 0 }, { x: 0, y: 0 }]);
  });

  it('neutral particles feel no EM force', () => {
    const acc = forces(input([particle({ id: 0, type: 'electronNeutrino' }), particle({ id: 1, x: 2 })]), { ...OFF, em: true });
    expect(acc).toEqual([{ x: 0, y: 0 }, { x: 0, y: 0 }]);
  });

  it('particles still telegraphing neither feel nor exert force', () => {
    const acc = forces(input([particle({ id: 0, type: 'up' }), particle({ id: 1, x: 2, live: false })]), { ...OFF, em: true });
    expect(acc).toEqual([{ x: 0, y: 0 }, { x: 0, y: 0 }]);
  });

  it('is not clamped at short range (as in the original), and is zero for coincident particles', () => {
    const [a] = forces(input([particle({ id: 0 }), particle({ id: 1, x: 0.01 })]), { ...OFF, em: true });
    expect(a.x).toBeCloseTo(-10 * 9 / 0.01, 6);
    expect(forces(input([particle({ id: 0 }), particle({ id: 1 })]), { ...OFF, em: true })[0]).toEqual({ x: 0, y: 0 });
  });

  it('is a force, not an acceleration: it does not depend on either particle\'s mass', () => {
    const light = forces(input([particle({ id: 0, type: 'electron' }), particle({ id: 1, type: 'electron', x: 3 })]), { ...OFF, em: true });
    const heavy = forces(input([particle({ id: 0, type: 'tau' }), particle({ id: 1, type: 'tau', x: 3 })]), { ...OFF, em: true });
    expect(heavy).toEqual(light);
  });
});

describe('forces: strong', () => {
  // Force = 500 * 0.02 = 10, constant with distance, doubled for the same colour.
  const strong = { ...OFF, strong: true };
  const pair = (a: Partial<ParticleSnapshot>, b: Partial<ParticleSnapshot>, gap = 3) =>
    forces(input([particle({ id: 0, type: 'up', ...a }), particle({ id: 1, type: 'up', x: gap, ...b })]), strong)[0].x;

  it('same parity, different colours attract with strength 10', () => {
    expect(pair({ colour: 'red' }, { colour: 'green' })).toBeCloseTo(10, 10);
  });
  it('same parity, same colour repel with double strength', () => {
    expect(pair({ colour: 'red' }, { colour: 'red' })).toBeCloseTo(-20, 10);
  });
  it('opposite parity, same colour attract with double strength', () => {
    expect(pair({ colour: 'blue' }, { colour: 'blue', parity: -1 })).toBeCloseTo(20, 10);
  });
  it('opposite parity, different colours repel with strength 10', () => {
    expect(pair({ colour: 'blue' }, { colour: 'red', parity: -1 })).toBeCloseTo(-10, 10);
  });
  it('does not fall off with distance', () => {
    expect(pair({ colour: 'red' }, { colour: 'green' }, 9)).toBeCloseTo(10, 10);
  });
  it('colourless (white) particles are untouched', () => {
    expect(pair({ colour: 'white' }, { colour: 'green' })).toBe(0);
  });
  it('does nothing when switched off', () => {
    const acc = forces(input([particle({ id: 0, colour: 'red' }), particle({ id: 1, x: 3, colour: 'green' })]), OFF);
    expect(acc[0]).toEqual({ x: 0, y: 0 });
  });
});

describe('forces: gravity', () => {
  // Force = 2000 * 0.02 * holeMass * particleMass / d^2 toward the black hole; independent of charge.
  // The particle's mass cancels out of its acceleration, as in the original.
  const hole = (mass = 10) => [{ x: 0, y: 0, mass, radius: 1 }];
  const at = (x: number, y = 0, over: Partial<ParticleSnapshot> = {}) => particle({ id: 0, type: 'electronNeutrino', x, y, ...over });
  const m = massOf('electronNeutrino');

  it('pulls a particle toward the black hole: 40*10*m/5^2', () => {
    const [a] = forces(input([at(5)], hole()), { ...OFF, gravity: true });
    expect(a.x).toBeCloseTo(-16 * m, 10);
    expect(a.y).toBeCloseTo(0, 10);
  });
  it('falls off as 1/d^2: twice as far, a quarter as strong', () => {
    const [a] = forces(input([at(10)], hole()), { ...OFF, gravity: true });
    expect(a.x).toBeCloseTo(-4 * m, 10);
  });
  it('works along any direction (3-4-5)', () => {
    const [a] = forces(input([at(3, 4)], hole()), { ...OFF, gravity: true });
    expect(a.x).toBeCloseTo(-16 * m * 0.6, 10);
    expect(a.y).toBeCloseTo(-16 * m * 0.8, 10);
  });
  it('a heavier particle is pulled harder, so every particle accelerates alike', () => {
    const [light] = forces(input([at(5)], hole()), { ...OFF, gravity: true });
    const [heavy] = forces(input([at(5, 0, { type: 'tau' })], hole()), { ...OFF, gravity: true });
    expect(heavy.x / massOf('tau')).toBeCloseTo(light.x / m, 10);
  });
  it('is inert while gravity is off', () => {
    expect(forces(input([at(5)], hole()), OFF)[0]).toEqual({ x: 0, y: 0 });
  });
  it('does not pull telegraphing particles', () => {
    expect(forces(input([at(5, 0, { live: false })], hole()), { ...OFF, gravity: true })[0]).toEqual({ x: 0, y: 0 });
  });
  it('stays finite at the centre', () => {
    const [a] = forces(input([at(0)], hole()), { ...OFF, gravity: true });
    expect(a).toEqual({ x: 0, y: 0 });
  });
});

describe('forces: weak', () => {
  it('exerts no push or pull: it acts through decay and change, not acceleration', () => {
    const ps = [particle({ id: 0, type: 'up', colour: 'red' }), particle({ id: 1, type: 'down', colour: 'green', x: 2 })];
    expect(forces(input(ps), { ...OFF, weak: true })).toEqual(forces(input(ps), OFF));
  });
});

describe('forces: a fresh W and its emitter', () => {
  const em = { ...OFF, em: true };
  const pair = (a: Partial<ParticleSnapshot> & { lifeTime?: number; immune?: number[] }, b: typeof a) =>
    forces(input([particle({ id: 0, ...a }), particle({ id: 1, x: 3, ...b })]), em)[0].x;

  it('particles with an immunity list feel nothing until both are half a second old', () => {
    expect(pair({ lifeTime: 0.1, immune: [1] }, { lifeTime: 5 })).toBe(0);
    expect(pair({ lifeTime: 0.6, immune: [1] }, { lifeTime: 0.1 })).toBe(0);
    expect(pair({ lifeTime: 0.6, immune: [1] }, { lifeTime: 0.6 })).not.toBe(0);
  });
  it('a recently changed particle still feels particles with no immunity', () => {
    expect(pair({ lifeTime: 0.1 }, { lifeTime: 0.1 })).not.toBe(0);
  });
});
