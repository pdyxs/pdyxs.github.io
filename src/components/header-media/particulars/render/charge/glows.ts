// Which charges light the background this frame, and how grown each one is. Pure.
import { CHARGE_BY_TYPE } from '../../../../../lib/particulars/constants';
import type { Snapshot } from '../../../../../lib/particulars/sim/snapshot';
import type { ParticleKind, Parity } from '../../../../../lib/particulars/scenario/types';
import { EM_FADE_SECONDS, GROW_SECONDS, MAX_CHARGE } from './palette';

/** The player has no particle id; this one never collides with the sim's (they count up from 0). */
export const PLAYER_GLOW_ID = -1;

export interface Glow {
  id: number;
  x: number;
  y: number;
  /** Signed charge in thirds of e. Changes instantly, as the Unity mesh rebuilt on EventParticleChanged. */
  charge: number;
  /** Linear 0..1 progress of the spawn/despawn scale tween. */
  grow: number;
  /** Whether the particle still exists (growing toward 1) or has gone (shrinking toward 0 where it was). */
  present: boolean;
}

/** Signed charge in thirds of e. */
export function chargeOf(type: ParticleKind, parity: Parity): number {
  return CHARGE_BY_TYPE[type] * parity;
}

/**
 * The quad's scale for a tween at `grow`: EaseInCubic both ways, as HOTween ran it on
 * the particle's localScale (0 → 1 on spawn, 1 → 0 on death).
 */
export function glowScale(g: Pick<Glow, 'grow' | 'present'>): number {
  const p = Math.min(1, Math.max(0, g.grow));
  return g.present ? p * p * p : 1 - (1 - p) ** 3;
}

/**
 * Advance every glow by `dt` seconds against the snapshot. Live, charged particles (and the
 * live player) grow in; ones that vanish shrink out at their last position and are then
 * dropped. A telegraphing particle has not spawned yet, so it does not glow. Neutral
 * particles never glow (Unity drew them as no-op quads).
 */
export function stepGlows(prev: readonly Glow[], snapshot: Snapshot, dt: number): Glow[] {
  const rate = dt / GROW_SECONDS;
  const byId = new Map<number, Glow>();
  for (const g of prev) byId.set(g.id, g);
  const next: Glow[] = [];
  const seen = new Set<number>();

  const visit = (id: number, x: number, y: number, charge: number) => {
    seen.add(id);
    const old = byId.get(id);
    // A shrinking glow that reappears grows again from the same visible scale.
    let grow = old ? (old.present ? old.grow : Math.cbrt(glowScale(old))) : 0;
    grow = Math.min(1, grow + rate);
    next.push({ id, x, y, charge, grow, present: true });
  };

  const p = snapshot.player;
  if (p.alive) {
    const q = chargeOf(p.type, p.parity);
    if (q !== 0) visit(PLAYER_GLOW_ID, p.x, p.y, q);
  }
  for (const part of snapshot.particles) {
    if (!part.live) continue;
    const q = chargeOf(part.type, part.parity);
    if (q !== 0) visit(part.id, part.x, part.y, q);
  }

  for (const old of prev) {
    if (seen.has(old.id)) continue;
    // Gone (or turned neutral): shrink where it was, from the scale it had.
    const grow = old.present ? 1 - Math.cbrt(1 - glowScale(old)) : old.grow;
    const left = grow - rate;
    if (left > 0) next.push({ ...old, grow: left, present: false });
  }
  return next;
}

/** The EM switch's fade, 0..1, moved toward the switch by `dt`. */
export function stepEmFade(prev: number, emOn: boolean, dt: number): number {
  const step = dt / EM_FADE_SECONDS;
  return emOn ? Math.min(1, prev + step) : Math.max(0, prev - step);
}

/**
 * Pack glows for the shader: x, y (world), radius scale (0..1), charge (thirds of e,
 * clamped as Unity encoded it, times the EM fade) into `out`. Returns the count written.
 */
export function packGlows(glows: readonly Glow[], emFade: number, out: Float32Array): number {
  const max = Math.floor(out.length / 4);
  const fade = emFade * emFade * (3 - 2 * emFade);
  let n = 0;
  for (const g of glows) {
    if (n >= max) break;
    const s = glowScale(g);
    if (s <= 0 || fade <= 0) continue;
    out[n * 4] = g.x;
    out[n * 4 + 1] = g.y;
    out[n * 4 + 2] = s;
    out[n * 4 + 3] = Math.max(-MAX_CHARGE, Math.min(MAX_CHARGE, g.charge)) * fade;
    n++;
  }
  return n;
}
