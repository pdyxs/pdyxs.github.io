import type { ForceSwitches, ParticleColour, ParticleType, Parity } from '../scenario/types';

/** One non-player particle. `live` is false while it is still telegraphing its arrival. */
export interface ParticleSnapshot {
  id: number;
  type: ParticleType;
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
  player: { x: number; y: number; radius: number };
  particles: ParticleSnapshot[];
  blackHoles: BlackHoleSnapshot[];
  /** Which forces the scenario has switched on. */
  forces: ForceSwitches;
}
