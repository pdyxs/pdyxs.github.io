import { CHANGE_TWEEN_SECONDS, CHARGE_BY_TYPE, COLOUR_STRENGTH, EM_STRENGTH, FIXED_DT, GRAVITY_STRENGTH, massOf } from '../constants';
import type { ForceSwitches } from '../scenario/types';
import type { Vec } from '../input/steer';
import type { ParticleSnapshot, Snapshot } from './snapshot';

/**
 * A particle as forces() sees it. `lifeTime` (seconds since spawning or last
 * changing) and `immune` (ids) are the original's rule for keeping a fresh W
 * and its emitter from pushing on each other; omitted, the particle is settled.
 */
export type ForcedParticle = ParticleSnapshot & { lifeTime?: number; immune?: number[] };

/** The slice of a Snapshot that forces() reads. */
export type ForceInput = Pick<Snapshot, 'blackHoles'> & { particles: ForcedParticle[] };

/** Pure: the original's test for whether two particles feel each other: both settled, or neither immune to anything. */
function feelEachOther(a: ForcedParticle, b: ForcedParticle): boolean {
  const settled = (p: ForcedParticle) => (p.lifeTime ?? Infinity) >= CHANGE_TWEEN_SECONDS;
  if (settled(a) && settled(b)) return true;
  const ai = a.immune ?? [];
  const bi = b.immune ?? [];
  return ai.length === 0 && bi.length === 0;
}

const ZERO: Vec = { x: 0, y: 0 };

/**
 * Pure: the force on each particle (parallel to `input.particles`, which
 * includes the player) from the switched-on forces (weak adds none: it acts
 * through decay and change). Telegraphing particles neither feel nor exert
 * anything. These are forces, as in the original: the world divides by mass,
 * so a light particle is thrown about by what barely moves a heavy one.
 */
export function forces(input: ForceInput, switches: ForceSwitches): Vec[] {
  const { particles } = input;
  const out: Vec[] = particles.map(() => ({ ...ZERO }));
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const a = particles[i];
      const b = particles[j];
      if (!a.live || !b.live || !feelEachOther(a, b)) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.hypot(dx, dy);
      if (d === 0) continue;
      let amount = 0; // positive pushes a away from b
      if (switches.em) {
        amount += (EM_STRENGTH * FIXED_DT * chargeOf(a) * chargeOf(b)) / d;
      }
      if (switches.strong) amount += colourForce(a, b);
      const ux = (dx / d) * amount;
      const uy = (dy / d) * amount;
      out[i].x += ux; out[i].y += uy;
      out[j].x -= ux; out[j].y -= uy;
    }
  }
  if (switches.gravity) {
    particles.forEach((p, i) => {
      if (!p.live) return;
      for (const h of input.blackHoles) {
        const dx = h.x - p.x;
        const dy = h.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d === 0) continue;
        const pull = (GRAVITY_STRENGTH * FIXED_DT * h.mass * massOf(p.type)) / d ** 2;
        out[i].x += (dx / d) * pull;
        out[i].y += (dy / d) * pull;
      }
    });
  }
  return out;
}

const chargeOf = (p: { type: keyof typeof CHARGE_BY_TYPE; parity: number }) => CHARGE_BY_TYPE[p.type] * p.parity;

/** Positive pushes `a` away from `b`. Constant in distance; doubled for the same colour. */
function colourForce(a: ParticleSnapshot, b: ParticleSnapshot): number {
  if (a.colour === 'white' || b.colour === 'white') return 0;
  const diffColour = a.colour !== b.colour;
  const attract = a.parity !== b.parity ? !diffColour : diffColour;
  const strength = COLOUR_STRENGTH * FIXED_DT * (diffColour ? 1 : 2);
  return attract ? -strength : strength;
}
