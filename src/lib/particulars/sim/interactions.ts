import { CHARGE_BY_TYPE, DECAY_TIME_BY_TYPE } from '../constants';
import type { Parity, ParticleKind, ParticleSpec } from '../scenario/types';

/**
 * The weak force's fixed partner for each type: the same generation, the other
 * charge (up/down, electron/its neutrino...). Player-initiated change and
 * boson absorption both go here; Unity's `sidegradesTo`.
 */
export const SIDEGRADES_TO: Record<Exclude<ParticleKind, 'W'>, Exclude<ParticleKind, 'W'>> = {
  up: 'down', down: 'up', strange: 'charm', charm: 'strange', top: 'bottom', bottom: 'top',
  electron: 'electronNeutrino', electronNeutrino: 'electron',
  muon: 'muonNeutrino', muonNeutrino: 'muon',
  tau: 'tauNeutrino', tauNeutrino: 'tau',
};

/** Where a decaying type goes: one generation down, shedding a W. Types absent here are stable. */
export const DECAYS_TO: Partial<Record<keyof typeof DECAY_TIME_BY_TYPE, Exclude<ParticleKind, 'W'>>> = {
  top: 'bottom', bottom: 'charm', charm: 'strange', strange: 'up',
  muon: 'muonNeutrino', tau: 'tauNeutrino',
};

const chargeOf = (s: { type: ParticleKind; parity: Parity }) => CHARGE_BY_TYPE[s.type] * s.parity;
const isBoson = (s: { type: ParticleKind }) => s.type === 'W';


/** A particle as the rules see it: its spec plus an id the applier maps back to a body. */
export interface Participant extends ParticleSpec {
  id: number;
}

/** What a rule needs to know of the world: which forces are on. */
export interface RuleSwitches {
  weak: boolean;
}

export type Outcome =
  | { kind: 'annihilate'; ids: [number, number] }
  | { kind: 'absorb'; id: number; bosonId: number; becomes: ParticleSpec }
  | { kind: 'decay' | 'change'; id: number; becomes: ParticleSpec; boson: ParticleSpec };

/** Pure: the particle after absorbing a boson: the sidegrade type, with the parity that makes its charge the sum. */
function absorbed(p: Participant, boson: Participant): ParticleSpec | null {
  if (isBoson(p)) return null;
  const q = chargeOf(p);
  const bc = chargeOf(boson);
  if (q !== 0 && q * bc >= 0) return null;
  const type = SIDEGRADES_TO[p.type as keyof typeof SIDEGRADES_TO];
  const total = q + bc;
  return { type, colour: p.colour, parity: (Math.sign(total) * Math.sign(CHARGE_BY_TYPE[type]) || p.parity) as Parity };
}

/** Pure: what happens when two particles touch. */
export function interactions(a: Participant, b: Participant, switches: RuleSwitches): Outcome[] {
  if (switches.weak && isBoson(a) !== isBoson(b)) {
    const [p, boson] = isBoson(b) ? [a, b] : [b, a];
    const becomes = absorbed(p, boson);
    return becomes ? [{ kind: 'absorb', id: p.id, bosonId: boson.id, becomes }] : [];
  }
  if (a.type === b.type && a.parity !== b.parity) return [{ kind: 'annihilate', ids: [a.id, b.id] }];
  return [];
}

/** Pure: the particle after a weak transition to `type`, and the W that carries off the charge difference. */
function transition(kind: 'decay' | 'change', p: Participant, type: Exclude<ParticleKind, 'W'>): Outcome {
  const becomes: ParticleSpec = { type, colour: p.colour, parity: p.parity };
  const boson: ParticleSpec = { type: 'W', colour: 'white', parity: Math.sign(chargeOf(p) - chargeOf(becomes)) as Parity };
  return { kind, id: p.id, becomes, boson };
}

/** Pure: whether a particle of `age` seconds decays now. */
export function decay(p: Participant, age: number, switches: RuleSwitches): Outcome[] {
  if (!switches.weak || isBoson(p)) return [];
  const type = DECAYS_TO[p.type as keyof typeof DECAYS_TO];
  if (!type || age < DECAY_TIME_BY_TYPE[p.type as keyof typeof DECAY_TIME_BY_TYPE]) return [];
  return [transition('decay', p, type)];
}

/** Pure: the player-initiated change: free, unlimited, to the fixed sidegrade partner. */
export function change(p: Participant, switches: RuleSwitches): Outcome[] {
  if (!switches.weak || isBoson(p)) return [];
  return [transition('change', p, SIDEGRADES_TO[p.type as keyof typeof SIDEGRADES_TO])];
}
