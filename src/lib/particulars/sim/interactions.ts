import { BOSON_ABSORB_AGE_ENTER, BOSON_ABSORB_AGE_STAY, CHARGE_BY_TYPE, DECAY_TIME_BY_TYPE } from '../constants';
import type { Parity, ParticleKind, ParticleSpec } from '../scenario/types';

type Matter = Exclude<ParticleKind, 'W'>;

/** The weak force's player-initiated change: the same generation, the other charge (`sidegradePaths`). */
export const SIDEGRADES_TO: Record<Matter, Matter> = {
  up: 'down', down: 'up', strange: 'charm', charm: 'strange', top: 'bottom', bottom: 'top',
  electron: 'electronNeutrino', electronNeutrino: 'electron',
  muon: 'muonNeutrino', muonNeutrino: 'muon',
  tau: 'tauNeutrino', tauNeutrino: 'tau',
};

/** Where a decaying type goes, shedding a W (`decayPaths`). Types absent here are stable. */
export const DECAYS_TO: Partial<Record<ParticleKind, Matter>> = {
  strange: 'up', charm: 'down', top: 'strange', bottom: 'charm',
  muon: 'electronNeutrino', tau: 'muonNeutrino',
};

/** What absorbing a W turns a type into (`upgradePaths`). */
export const UPGRADES_TO: Record<Matter, Matter> = {
  up: 'strange', down: 'charm', strange: 'top', charm: 'bottom', top: 'bottom', bottom: 'top',
  electron: 'muonNeutrino', muon: 'tauNeutrino', tau: 'tauNeutrino',
  electronNeutrino: 'muon', muonNeutrino: 'tau', tauNeutrino: 'tau',
};

const chargeOf = (s: { type: ParticleKind; parity: Parity }) => CHARGE_BY_TYPE[s.type] * s.parity;
const isBoson = (s: { type: ParticleKind }) => s.type === 'W';
export const isNeutrino = (s: { type: ParticleKind }) => s.type === 'electronNeutrino' || s.type === 'muonNeutrino' || s.type === 'tauNeutrino';

/** A particle as the rules see it: its spec plus an id the applier maps back to a body. */
export interface Participant extends ParticleSpec {
  id: number;
  /** Seconds since it spawned or last changed type. */
  lifeTime: number;
  /** Ids this particle ignores for absorption and forces (a W is immune to what emitted it). */
  immune: number[];
  /** Mid-change: it ignores contacts until the change has run. */
  changing: boolean;
}

/** What a rule needs to know of the world: which forces are on. */
export interface RuleSwitches {
  weak: boolean;
}

export type Outcome =
  | { kind: 'annihilate'; ids: [number, number] }
  | { kind: 'absorb'; id: number; bosonId: number; becomes: ParticleSpec }
  | { kind: 'decay' | 'change'; id: number; becomes: ParticleSpec; boson: ParticleSpec }
  | { kind: 'boson-decay'; id: number };

/** Pure: a particle after absorbing a boson: its upgrade type, same colour and parity. */
function absorbed(p: Participant): ParticleSpec {
  return { type: UPGRADES_TO[p.type as Matter], colour: p.colour, parity: p.parity };
}

/**
 * Pure: what happens when two particles touch. `fresh` is a contact that just
 * began (the original's OnCollisionEnter / OnTriggerEnter); otherwise it has
 * been going on (OnCollisionStay), where a boson must be older to be absorbed.
 * Only a collision annihilates; a neutrino is a trigger and never does.
 */
export function interactions(a: Participant, b: Participant, switches: RuleSwitches, fresh = true): Outcome[] {
  if (isBoson(a) !== isBoson(b)) {
    if (!switches.weak) return [];
    const [p, boson] = isBoson(b) ? [a, b] : [b, a];
    if (p.changing) return [];
    if (!isNeutrino(p) && chargeOf(p) * chargeOf(boson) >= 0) return [];
    const age = fresh || isNeutrino(p) ? BOSON_ABSORB_AGE_ENTER : BOSON_ABSORB_AGE_STAY;
    if (boson.lifeTime > age || !boson.immune.includes(p.id)) {
      return [{ kind: 'absorb', id: p.id, bosonId: boson.id, becomes: absorbed(p) }];
    }
    return [];
  }
  if (!fresh || isNeutrino(a) || isNeutrino(b)) return [];
  // The original starts it from the matter side, which must not be mid-change.
  if ((a.parity > 0 ? a : b).changing) return [];
  if (a.type === b.type && a.parity !== b.parity) return [{ kind: 'annihilate', ids: [a.id, b.id] }];
  return [];
}

/** Pure: the particle after a weak transition to `type`, and the W that carries off the charge difference. */
function transition(kind: 'decay' | 'change', p: Participant, type: Matter): Outcome {
  const becomes: ParticleSpec = { type, colour: p.colour, parity: p.parity };
  const boson: ParticleSpec = { type: 'W', colour: 'white', parity: Math.sign(chargeOf(p) - chargeOf(becomes)) as Parity };
  return { kind, id: p.id, becomes, boson };
}

/**
 * Pure: whether a particle whose decay timer has run `timer` seconds decays now.
 * The timer only runs while the type decays and is never reset by a change.
 */
export function decay(p: Participant, timer: number, switches: RuleSwitches): Outcome[] {
  if (!switches.weak) return [];
  const time = DECAY_TIME_BY_TYPE[p.type as keyof typeof DECAY_TIME_BY_TYPE];
  if (time === undefined || !(timer > time)) return [];
  if (isBoson(p)) return [{ kind: 'boson-decay', id: p.id }];
  return [transition('decay', p, DECAYS_TO[p.type]!)];
}

/** Pure: the player-initiated change: free, unlimited, to the fixed sidegrade partner. */
export function change(p: Participant, switches: RuleSwitches): Outcome[] {
  if (!switches.weak || isBoson(p)) return [];
  return [transition('change', p, SIDEGRADES_TO[p.type as Matter])];
}
