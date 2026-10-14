import type { ParticleSpec } from '../scenario/types';

/**
 * What happened in a step, as plain data for anything that listens (the view,
 * a sound layer, a test). Each carries the new state, not a delta.
 */
export type WorldEvent =
  | { tick: number; kind: 'annihilated'; a: ParticleSpec; b: ParticleSpec; playerDied: boolean }
  | { tick: number; kind: 'absorbed' | 'decayed' | 'changed'; from: ParticleSpec; to: ParticleSpec; isPlayer: boolean }
  | DestroyedEvent;

/** A wall in destroy mode killed a particle (or the player). */
export type DestroyedEvent = { tick: number; kind: 'destroyed'; particle: ParticleSpec; isPlayer: boolean };
