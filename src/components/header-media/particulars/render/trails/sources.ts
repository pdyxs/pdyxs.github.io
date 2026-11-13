// What leaves a trail this frame, read from the snapshot. Pure.
import type { Snapshot } from '../../../../../lib/particulars/sim/snapshot';

export interface TrailSource {
  /** Particle id; the player is PLAYER_KEY. */
  key: number;
  x: number;
  y: number;
  speed: number;
  isPlayer: boolean;
  parity: number;
  neutrino: boolean;
}

export const PLAYER_KEY = -1;

const NEUTRINOS = new Set(['electronNeutrino', 'muonNeutrino', 'tauNeutrino']);

/** Live particles plus the living player. Telegraphing (`live === false`) particles leave nothing yet. */
export function trailSources(s: Snapshot, out: TrailSource[] = []): TrailSource[] {
  out.length = 0;
  const p = s.player;
  if (p.alive) {
    out.push({ key: PLAYER_KEY, x: p.x, y: p.y, speed: Math.hypot(p.vx, p.vy), isPlayer: true, parity: p.parity, neutrino: NEUTRINOS.has(p.type) });
  }
  for (const q of s.particles) {
    if (!q.live) continue;
    out.push({ key: q.id, x: q.x, y: q.y, speed: Math.hypot(q.vx, q.vy), isPlayer: false, parity: q.parity, neutrino: NEUTRINOS.has(q.type) });
  }
  return out;
}
