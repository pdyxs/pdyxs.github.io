import { describe, it, expect } from 'vitest';
import { change, decay, interactions } from './interactions';
import { DECAY_TIME_BY_TYPE } from '../constants';
import type { Participant } from './interactions';

const p = (id: number, type: Participant['type'], parity: 1 | -1 = 1, over: Partial<Participant> = {}): Participant => ({
  id, type, colour: 'white', parity, lifeTime: 10, immune: [], changing: false, ...over,
});
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
  it('a neutrino is a trigger and never annihilates', () => {
    expect(interactions(p(1, 'electronNeutrino'), p(2, 'electronNeutrino', -1), WEAK)).toEqual([]);
  });
  it('the matter side must not be mid-change', () => {
    expect(interactions(p(1, 'electron', 1, { changing: true }), p(2, 'electron', -1), WEAK)).toEqual([]);
  });
  it('only a contact that has just begun annihilates', () => {
    expect(interactions(p(1, 'electron'), p(2, 'electron', -1), WEAK, false)).toEqual([]);
  });
});

describe('interactions: boson absorption', () => {
  it('a charged particle absorbs a W of opposite charge and upgrades, keeping colour and parity', () => {
    // down (-1) + W (+3): down's upgrade path is charm
    expect(interactions(p(1, 'down'), p(2, 'W', 1), WEAK)).toEqual([
      { kind: 'absorb', id: 1, bosonId: 2, becomes: { type: 'charm', colour: 'white', parity: 1 } },
    ]);
  });
  it('is symmetric in argument order', () => {
    expect(interactions(p(2, 'W', 1), p(1, 'down'), WEAK)).toEqual([
      { kind: 'absorb', id: 1, bosonId: 2, becomes: { type: 'charm', colour: 'white', parity: 1 } },
    ]);
  });
  it('follows the original upgrade paths', () => {
    const up = (type: Participant['type'], w: 1 | -1) =>
      (interactions(p(1, type), p(2, 'W', w), WEAK)[0] as { becomes: { type: string } }).becomes.type;
    expect(up('up', -1)).toBe('strange');
    expect(up('strange', 1)).toBe('top');
    expect(up('electron', 1)).toBe('muonNeutrino');
    expect(up('muon', 1)).toBe('tauNeutrino');
  });
  it('an antiquark absorbs the opposite W', () => {
    const [o] = interactions(p(1, 'up', -1), p(2, 'W', 1), WEAK);
    expect(o).toMatchObject({ kind: 'absorb', becomes: { type: 'strange', parity: -1 } });
  });
  it('a W of the same sign passes by', () => {
    expect(interactions(p(1, 'down'), p(2, 'W', -1), WEAK)).toEqual([]);
  });
  it('a neutrino absorbs either W, whatever its charge', () => {
    expect(interactions(p(1, 'electronNeutrino'), p(2, 'W', -1), WEAK)[0]).toMatchObject({ becomes: { type: 'muon', parity: 1 } });
    expect(interactions(p(1, 'electronNeutrino'), p(2, 'W', 1), WEAK)[0]).toMatchObject({ becomes: { type: 'muon', parity: 1 } });
  });
  it('needs the weak force', () => {
    expect(interactions(p(1, 'down'), p(2, 'W', 1), NO_WEAK)).toEqual([]);
  });
  it('a particle that is mid-change cannot absorb', () => {
    expect(interactions(p(1, 'down', 1, { changing: true }), p(2, 'W', 1), WEAK)).toEqual([]);
  });
  it('a young W cannot be absorbed by what emitted it, but an old one can', () => {
    const young = p(2, 'W', 1, { lifeTime: 0.5, immune: [1] });
    expect(interactions(p(1, 'down'), young, WEAK)).toEqual([]);
    expect(interactions(p(3, 'down'), young, WEAK)).toHaveLength(1);
    expect(interactions(p(1, 'down'), p(2, 'W', 1, { lifeTime: 0.9, immune: [1] }), WEAK)).toHaveLength(1);
  });
  it('a contact that has been going on needs the W to be older still', () => {
    const w = p(2, 'W', 1, { lifeTime: 0.9, immune: [1] });
    expect(interactions(p(1, 'down'), w, WEAK, false)).toEqual([]);
    expect(interactions(p(1, 'down'), { ...w, lifeTime: 1.1 }, WEAK, false)).toHaveLength(1);
  });
});

describe('interactions: weak decay', () => {
  it('a heavy particle whose timer has passed its decay time takes its decay path and sheds a W', () => {
    // top (+2) -> strange (-1): the W carries away +3
    expect(decay(p(1, 'top'), DECAY_TIME_BY_TYPE.top + 0.01, WEAK)).toEqual([
      { kind: 'decay', id: 1, becomes: { type: 'strange', colour: 'white', parity: 1 }, boson: { type: 'W', colour: 'white', parity: 1 } },
    ]);
  });
  it('an antiparticle sheds the opposite W', () => {
    const [o] = decay(p(1, 'muon', -1), 99, WEAK);
    expect(o).toMatchObject({ becomes: { type: 'electronNeutrino', parity: -1 }, boson: { type: 'W', parity: 1 } });
  });
  it('waits until its time is up, strictly', () => {
    expect(decay(p(1, 'top'), DECAY_TIME_BY_TYPE.top, WEAK)).toEqual([]);
  });
  it('stable types never decay', () => {
    expect(decay(p(1, 'down'), 1e6, WEAK)).toEqual([]);
    expect(decay(p(1, 'up'), 1e6, WEAK)).toEqual([]);
  });
  it('a W decays on its own timer', () => {
    expect(decay(p(1, 'W', 1), DECAY_TIME_BY_TYPE.W + 0.01, WEAK)).toEqual([{ kind: 'boson-decay', id: 1 }]);
  });
  it('needs the weak force', () => {
    expect(decay(p(1, 'top'), 99, NO_WEAK)).toEqual([]);
  });
});

describe('interactions: particle change', () => {
  it('sidegrades to the fixed partner type and sheds the W that balances the charge', () => {
    // down (-1) -> up (+2): the W carries away -3
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
