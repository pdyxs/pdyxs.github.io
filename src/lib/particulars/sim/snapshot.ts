import type { ForceSwitches, ParticleColour, ParticleKind, Parity } from '../scenario/types';

/** One non-player particle. `live` is false while it is still telegraphing its arrival. */
export interface ParticleSnapshot {
  id: number;
  type: ParticleKind;
  colour: ParticleColour;
  parity: Parity;
  x: number;
  y: number;
  radius: number;
  live: boolean;
}

/** A gravity source as the view and forces() see it. */
export interface BlackHoleSnapshot {
  x: number;
  y: number;
  mass: number;
  radius: number;
}

/** Plain data the view reads each frame. Never contains physics objects. */
export interface Snapshot {
  tick: number;
  walls: { width: number; height: number };
  /** `alive` goes false when the player is annihilated; the body then stays where it died. */
  player: { x: number; y: number; radius: number; type: ParticleKind; colour: ParticleColour; parity: Parity; alive: boolean };
  particles: ParticleSnapshot[];
  blackHoles: BlackHoleSnapshot[];
  /** Which forces the scenario has switched on. */
  forces: ForceSwitches;
}
