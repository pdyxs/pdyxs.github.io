// Pure: which sprites make up a particle, in what colours — ParticleMeshUtil.BuildLayeredMeshes
// and ParticleViewConstants.GetParticleMesh, decided from plain data.
import type { ParticleColour, ParticleKind, Parity } from '../../../../../lib/particulars/scenario/types';
import { CHARGE_BY_TYPE } from '../../../../../lib/particulars/constants';
import { PLAYER_SHADE, SPRITE_NAMES, W_GLOW_ALPHA, W_GLOW_DARKEN, type BodiesPalette, type Rgba } from './palette';

export interface BodySpec {
  type: ParticleKind;
  parity: Parity;
  colour: ParticleColour;
  isPlayer: boolean;
  /** The strong force is on: the pupil takes the particle's colour. */
  strong: boolean;
}

export interface SpriteLayer {
  /** 0..5: draw order, and which row of the eye tables moves it. */
  layer: number;
  sprite: string;
  /** Straight (not premultiplied) colour the sprite is multiplied by. */
  tint: Rgba;
}

const WHITE: Rgba = [1, 1, 1, 1];

/** ColorUtils.darken. */
export function darken(c: Rgba, amount: number): Rgba {
  const m = 1 - amount;
  return [c[0] * m, c[1] * m, c[2] * m, c[3]];
}

/** ColorUtils.lighten: scale up, and past white, spread the excess into grey. */
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

/** ParticleMeshUtil.isplayer: the layers that take the player's colour. */
export const isPlayerColourLayer = (layer: number, type: ParticleKind): boolean =>
  (layer > 2 && layer < 5) || (layer === 2 && type !== 'top');

/**
 * The sprite name for one layer, or null when that layer is empty for the type. `has` says which
 * names exist in the atlas.
 */
export function spriteFor(spec: BodySpec, layer: number, has: (name: string) => boolean): string | null {
  const [name, anti] = SPRITE_NAMES[spec.type];
  if (spec.isPlayer && has(`${name}${layer}player`)) return `${name}${layer}player`;
  // Under the strong force an antiparticle shows the white (matter) pupil, so the colour reads.
  const useMatter = spec.parity > 0 || (layer === 5 && spec.strong);
  const s = `${useMatter ? name : anti}${layer}`;
  return has(s) ? s : null;
}

/** Pure: the layers to draw, bottom first. */
export function bodyLayers(spec: BodySpec, palette: BodiesPalette, has: (name: string) => boolean): SpriteLayer[] {
  const out: SpriteLayer[] = [];
  for (let layer = 0; layer < 6; layer++) {
    const sprite = spriteFor(spec, layer, has);
    if (!sprite) continue;
    out.push({ layer, sprite, tint: tintFor(spec, layer, palette) });
  }
  return out;
}

function tintFor(spec: BodySpec, layer: number, palette: BodiesPalette): Rgba {
  if (layer === 1) {
    // The glow's vertex colour: pos for a positive charge once parity is applied, else neg.
    const positive = CHARGE_BY_TYPE[spec.type] * spec.parity > 0;
    const c = positive ? palette.glowPos : palette.glowNeg;
    return spec.type === 'W' ? darken([c[0], c[1], c[2], W_GLOW_ALPHA], W_GLOW_DARKEN) : c;
  }
  if (layer === 5) {
    return spec.strong && spec.colour !== 'white' ? palette.strong[spec.colour] : WHITE;
  }
  if (spec.isPlayer && isPlayerColourLayer(layer, spec.type)) {
    const shade = PLAYER_SHADE[`${spec.type}:${layer}`] ?? 0;
    return shade > 0 ? lighten(palette.player, shade) : palette.player;
  }
  return WHITE;
}

/** A key that changes exactly when the sprites or their colours would be rebuilt (OnParticleInit). */
export const recipeKey = (s: BodySpec): string => `${s.type}|${s.parity}|${s.colour}|${s.strong ? 1 : 0}`;
