import type { WallDef, ForceSwitches, ParticleColour, ParticleKind, Parity } from '../scenario/types';

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

/** An explosion in progress: a ring from the centre out to `radius`, which grows toward `maxRadius`. */
export interface ExplosionSnapshot {
  id: number;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
}

/** A pickup waiting to be collected. `life` runs from 1 (new) down to 0 (gone). */
export interface PickupSnapshot {
  id: number;
  x: number;
  y: number;
  life: number;
}

/** Plain data the view reads each frame. Never contains physics objects. */
export interface Snapshot {
  tick: number;
  walls: { width: number; height: number };
  /** `alive` goes false when the player is annihilated; the body then stays where it died. */
  player: { x: number; y: number; radius: number; type: ParticleKind; colour: ParticleColour; parity: Parity; alive: boolean };
  particles: ParticleSnapshot[];
  blackHoles: BlackHoleSnapshot[];
  /** Interior walls, as authored: static for the whole run. */
  barriers: WallDef[];
  /** Which forces are on right now (a scenario's start state, changed by commands). */
  forces: ForceSwitches;
  explosions: ExplosionSnapshot[];
  /** Whether the scenario uses pickups at all; the rest of the pickup state is empty when it does not. */
  pickupsEnabled: boolean;
  pickups: PickupSnapshot[];
  /** Pickups the player has collected. */
  collected: number;
}
