import { describe, it, expect } from 'vitest';
import { change, decay, interactions } from './interactions';
import { DECAY_TIME_BY_TYPE } from '../constants';
import type { Participant } from './interactions';

const p = (id: number, type: Participant['type'], parity: 1 | -1 = 1): Participant => ({ id, type, colour: 'white', parity });
const WEAK = { weak: true };
const NO_WEAK = { weak: false };

describe('interactions: annihilation', () => {
  it('a particle and its antiparticle annihilate, with or without the weak force', () => {
    expect(interactions(p(1, 'electron'), p(2, 'electron', -1), NO_WEAK)).toEqual([{ kind: 'annihilate', ids: [1, 2] }]);
  });
  it('same parity, or different types, do not', () => {
    expect(interactions(p(1, 'electron'), p(2, 'electron'), WEAK)).toEqual([]);
    expect(interactions(p(1, 'electron'), p(2, 'muon', -1), WEAK)).toEqual([]);
  });
});

describe('interactions: boson absorption', () => {
  it('a charged particle absorbs a W of opposite charge and becomes its sidegrade', () => {
    // down (-1/3) + W (+1) -> up (+2/3)
    expect(interactions(p(1, 'down'), p(2, 'W', 1), WEAK)).toEqual([
      { kind: 'absorb', id: 1, bosonId: 2, becomes: { type: 'up', colour: 'white', parity: 1 } },
    ]);
  });
  it('is symmetric in argument order', () => {
    expect(interactions(p(2, 'W', 1), p(1, 'down'), WEAK)).toEqual([
      { kind: 'absorb', id: 1, bosonId: 2, becomes: { type: 'up', colour: 'white', parity: 1 } },
    ]);
  });
  it('an antiquark absorbs the opposite W', () => {
    const [o] = interactions(p(1, 'up', -1), p(2, 'W', 1), WEAK);
    expect(o).toMatchObject({ kind: 'absorb', becomes: { type: 'down', parity: -1 } });
  });
  it('a W of the same sign passes by', () => {
    expect(interactions(p(1, 'down'), p(2, 'W', -1), WEAK)).toEqual([]);
  });
  it('a neutrino absorbs either W and takes the charge it brings', () => {
    expect(interactions(p(1, 'electronNeutrino'), p(2, 'W', -1), WEAK)[0]).toMatchObject({
      becomes: { type: 'electron', parity: 1 },
    });
    expect(interactions(p(1, 'electronNeutrino'), p(2, 'W', 1), WEAK)[0]).toMatchObject({
      becomes: { type: 'electron', parity: -1 },
    });
  });
  it('needs the weak force', () => {
    expect(interactions(p(1, 'down'), p(2, 'W', 1), NO_WEAK)).toEqual([]);
  });
});

describe('interactions: weak decay', () => {
  it('a heavy particle that has lived its decay time becomes its lower-generation type and sheds a W', () => {
    // top (+2/3) -> bottom (-1/3): the W carries away +1
    expect(decay(p(1, 'top'), DECAY_TIME_BY_TYPE.top, WEAK)).toEqual([
      { kind: 'decay', id: 1, becomes: { type: 'bottom', colour: 'white', parity: 1 }, boson: { type: 'W', colour: 'white', parity: 1 } },
    ]);
  });
  it('an antiparticle sheds the opposite W', () => {
    const [o] = decay(p(1, 'muon', -1), 99, WEAK);
    expect(o).toMatchObject({ becomes: { type: 'muonNeutrino', parity: -1 }, boson: { type: 'W', parity: 1 } });
  });
  it('waits until its time is up', () => {
    expect(decay(p(1, 'top'), DECAY_TIME_BY_TYPE.top - 0.1, WEAK)).toEqual([]);
  });
  it('stable types never decay', () => {
    expect(decay(p(1, 'down'), 1e6, WEAK)).toEqual([]);
    expect(decay(p(1, 'W', 1), 1e6, WEAK)).toEqual([]);
  });
  it('needs the weak force', () => {
    expect(decay(p(1, 'top'), 99, NO_WEAK)).toEqual([]);
  });
});

describe('interactions: particle change', () => {
  it('sidegrades to the fixed partner type and sheds the W that balances the charge', () => {
    // down (-1/3) -> up (+2/3): the W carries away -1
    expect(change(p(1, 'down'), WEAK)).toEqual([
      { kind: 'change', id: 1, becomes: { type: 'up', colour: 'white', parity: 1 }, boson: { type: 'W', colour: 'white', parity: -1 } },
    ]);
  });
  it('is its own inverse up to the W: up goes back to down', () => {
    const [o] = change(p(1, 'up'), WEAK);
    expect(o).toMatchObject({ becomes: { type: 'down' }, boson: { parity: 1 } });
  });
  it('needs the weak force, and bosons have nothing to change to', () => {
    expect(change(p(1, 'down'), NO_WEAK)).toEqual([]);
    expect(change(p(1, 'W', 1), WEAK)).toEqual([]);
  });
});
