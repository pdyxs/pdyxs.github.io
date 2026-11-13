// Trail colours, decided from plain data. Pure.
import type { Theme } from '../types';
import {
  LIGHT_NEG_TRAIL_COLOUR, LIGHT_PLAYER_DARKEN, LIGHT_POS_TRAIL_COLOUR, NEG_TRAIL_COLOUR, PLAYER_COLOUR, PLAYER_DARKEN, PLAYER_LIGHTEN, POS_TRAIL_COLOUR, type Rgba,
} from './constants';

/** ColorUtils.darken: scale rgb toward black. */
export function darken(c: Rgba, amount: number): Rgba {
  const m = 1 - amount;
  return [c[0] * m, c[1] * m, c[2] * m, c[3]];
}

/** ColorUtils.lighten: scale rgb up; once a channel would clip, push toward white keeping the hue. */
export function lighten(c: Rgba, amount: number): Rgba {
  const v = [c[0] * (1 + amount), c[1] * (1 + amount), c[2] * (1 + amount)];
  const m = Math.max(v[0], v[1], v[2]);
  if (m < 1) return [v[0], v[1], v[2], c[3]];
  const total = v[0] + v[1] + v[2];
  if (total > 3) return [1, 1, 1, c[3]];
  const x = (3 - total) / (3 * m - total);
  const grey = 1 - x * m;
  return [grey + x * c[0], grey + x * c[1], grey + x * c[2], c[3]];
}

export interface TrailColours {
  /** The particle's own trail colour. */
  main: Rgba;
  /** What `inverseColor` strands use: the opposite parity's colour. */
  inverse: Rgba;
}

const DARK = {
  player: { main: lighten(PLAYER_COLOUR, PLAYER_LIGHTEN), inverse: darken(PLAYER_COLOUR, PLAYER_DARKEN) },
  pos: { main: POS_TRAIL_COLOUR, inverse: NEG_TRAIL_COLOUR },
  neg: { main: NEG_TRAIL_COLOUR, inverse: POS_TRAIL_COLOUR },
};
const LIGHT = {
  player: { main: darken(PLAYER_COLOUR, LIGHT_PLAYER_DARKEN), inverse: lighten(PLAYER_COLOUR, PLAYER_LIGHTEN) },
  pos: { main: LIGHT_POS_TRAIL_COLOUR, inverse: LIGHT_NEG_TRAIL_COLOUR },
  neg: { main: LIGHT_NEG_TRAIL_COLOUR, inverse: LIGHT_POS_TRAIL_COLOUR },
};

/**
 * TrailView2point0.Update: the player has its own pair; others go by parity.
 * The theme picks the palette (dark is the original's).
 */
export function trailColours(isPlayer: boolean, parity: number, theme: Theme = 'dark'): TrailColours {
  const p = theme === 'light' ? LIGHT : DARK;
  if (isPlayer) return p.player;
  return parity > 0 ? p.pos : p.neg;
}
