// Pure: snapshot + view state → an ordered list of draws (sprites and rings), world units.
import type { Snapshot } from '../../../../../lib/particulars/sim/snapshot';
import { CHANGE_TWEEN_SECONDS, DECAY_TIME_BY_TYPE } from '../../../../../lib/particulars/constants';
import { crossfade, decayLeft, decayRing, easeInQuad, hash01, indicatorAlpha } from './motion';
import {
  ASSUMED_TELEGRAPH_SECONDS,
  DECAY_RING,
  PLAYER_INDICATOR,
  SPAWN_COLOUR_RING,
  SPAWN_SPIN_MAX_DEG_PER_S,
  SPAWN_SPIN_OFFSET_RANGE,
  type BodiesPalette,
  type Rgba,
} from './palette';
import { bodyLayers, recipeKey, type BodySpec, type SpriteLayer } from './recipe';
import { decayElapsed, PLAYER_KEY, type BodyState } from './tracker';

export type Draw =
  | { kind: 'sprite'; sprite: string; x: number; y: number; diameter: number; angle: number; tint: Rgba }
  | { kind: 'ring'; x: number; y: number; inner: number; outer: number; tint: Rgba };

export interface SceneInput {
  snapshot: Snapshot;
  palette: BodiesPalette;
  has: (sprite: string) => boolean;
  state: (id: number) => BodyState | undefined;
  cooldownLeft: number;
  /** Draw the player's indicator rings (PlayerIndicatorView). */
  indicator: boolean;
}

const withAlpha = (c: Rgba, a: number): Rgba => [c[0], c[1], c[2], c[3] * a];

/** Memoised recipe lookups: specs repeat across particles and frames. */
const recipes = new WeakMap<BodiesPalette, Map<string, SpriteLayer[]>>();
function layersFor(spec: BodySpec, palette: BodiesPalette, has: (s: string) => boolean): SpriteLayer[] {
  let byKey = recipes.get(palette);
  if (!byKey) recipes.set(palette, (byKey = new Map()));
  const k = `${recipeKey(spec)}|${spec.isPlayer ? 1 : 0}`;
  let r = byKey.get(k);
  if (!r) byKey.set(k, (r = bodyLayers(spec, palette, has)));
  return r;
}

export function buildScene(input: SceneInput, out: Draw[] = []): Draw[] {
  out.length = 0;
  const { snapshot: snap, palette, has } = input;
  const strong = snap.forces.strong;
  const weak = snap.forces.weak;

  for (const q of snap.particles) {
    const st = input.state(q.id);
    const spec: BodySpec = { type: q.type, parity: q.parity, colour: q.colour, isPlayer: false, strong };
    if (!q.live) {
      telegraph(out, q.id, q.x, q.y, q.radius * 2, spec, st, palette, has);
      continue;
    }
    body(out, spec, q.x, q.y, q.radius * 2, st, palette, has, weak, 1);
  }

  const p = snap.player;
  if (p.alive) {
    const st = input.state(PLAYER_KEY);
    const size = p.radius * 2;
    const a = !input.indicator ? 0 : indicatorAlpha(weak, input.cooldownLeft, PLAYER_INDICATOR.alpha, PLAYER_INDICATOR.weakAlpha);
    if (a > 0) {
      const scale = size + PLAYER_INDICATOR.scaleAdd;
      for (const r of PLAYER_INDICATOR.rings) {
        const c = r.radius * scale;
        const w = r.width * scale;
        out.push({ kind: 'ring', x: p.x, y: p.y, inner: c - w / 2, outer: c + w / 2, tint: withAlpha(palette.player, a * r.alpha) });
      }
    }
    const spec: BodySpec = { type: p.type, parity: p.parity, colour: p.colour, isPlayer: true, strong };
    body(out, spec, p.x, p.y, size, st, palette, has, weak, 1);
  }
  return out;
}

function body(
  out: Draw[],
  spec: BodySpec,
  x: number,
  y: number,
  size: number,
  st: BodyState | undefined,
  palette: BodiesPalette,
  has: (s: string) => boolean,
  weak: boolean,
  scale: number,
): void {
  const angle = spec.type === 'W' && st ? Math.atan2(st.heading.y, st.heading.x) : 0;
  const fade = st?.prev ? crossfade(st.changeAge / CHANGE_TWEEN_SECONDS) : null;

  // The decay timer, if this type decays and the weak force can make it happen.
  const decaySeconds = DECAY_TIME_BY_TYPE[spec.type as keyof typeof DECAY_TIME_BY_TYPE];
  let ring: Draw | null = null;
  if (weak && decaySeconds !== undefined && st) {
    const left = decayLeft(decayElapsed(st), decaySeconds);
    const band = decayRing(size * scale, left);
    const tint = spec.type === 'W' ? palette.decayBoson : spec.parity < 0 ? DECAY_RING.anti : DECAY_RING.matter;
    if (band.outer > band.inner) ring = { kind: 'ring', x, y, inner: band.inner, outer: band.outer, tint };
  }
  // Light mode's ink rim hugs the outside of the body, like the trailer's blob outline.
  if (palette.rim) {
    const r = (size * scale) / 2;
    out.push({ kind: 'ring', x, y, inner: r * 0.985, outer: r + Math.min(r * palette.rim.width, palette.rim.maxWidth * scale), tint: palette.rim.tint });
  }
  // A boson's timer sits behind its layers; anyone else's sits just over the glow (layer 1).
  if (ring && spec.type === 'W') out.push(ring);

  if (fade && st?.prev) layerDraws(out, layersFor(st.prev, palette, has), x, y, size * scale, angle, st, fade.from, scale, null);
  layerDraws(out, layersFor(spec, palette, has), x, y, size * scale, angle, st, fade ? fade.to : 1, scale, spec.type === 'W' ? null : ring);
}

function layerDraws(
  out: Draw[],
  layers: SpriteLayer[],
  x: number,
  y: number,
  diameter: number,
  angle: number,
  st: BodyState | undefined,
  alpha: number,
  scale: number,
  ringAfterGlow: Draw | null,
): void {
  let ringDone = ringAfterGlow === null;
  for (const l of layers) {
    if (!ringDone && l.layer > 1) {
      out.push(ringAfterGlow!);
      ringDone = true;
    }
    const ex = st ? st.eyes[l.layer * 2] * scale : 0;
    const ey = st ? st.eyes[l.layer * 2 + 1] * scale : 0;
    out.push({ kind: 'sprite', sprite: l.sprite, x: x + ex, y: y + ey, diameter, angle, tint: alpha === 1 ? l.tint : withAlpha(l.tint, alpha) });
  }
  if (!ringDone) out.push(ringAfterGlow!);
}

/** A particle still on its way in (SpawnerView): spinners, ring, and the particle growing. */
function telegraph(
  out: Draw[],
  id: number,
  x: number,
  y: number,
  size: number,
  spec: BodySpec,
  st: BodyState | undefined,
  palette: BodiesPalette,
  has: (s: string) => boolean,
): void {
  const age = st?.age ?? 0;
  const t = easeInQuad(Math.min(1, age / ASSUMED_TELEGRAPH_SECONDS));
  // The spawner pops in over 0.25 s (EaseOutQuad).
  const pop = Math.min(1, age / 0.25);
  const popScale = 1 - (1 - pop) * (1 - pop);
  const d = size * popScale;
  const par = spec.parity > 0 ? 'white' : 'black';
  const spawnTint: Rgba = spec.parity > 0 ? palette.spawnMatter : [1, 1, 1, 1];
  // Spin angle = ∫ t·max·offset dt; with t = (age/T)², that's max·offset·age³/(3T²).
  const T = ASSUMED_TELEGRAPH_SECONDS;
  const a = Math.min(age, T);
  const spun = ((SPAWN_SPIN_MAX_DEG_PER_S * Math.PI) / 180) * ((a * a * a) / (3 * T * T) + Math.max(0, age - T));
  for (let i = 5; i >= 1; i--) {
    const [lo, hi] = SPAWN_SPIN_OFFSET_RANGE;
    const offset = lo + (hi - lo) * hash01(id * 7 + i);
    const start = hash01(id * 13 + i) * Math.PI * 2;
    out.push({ kind: 'sprite', sprite: `s-${par}-spin-${i}`, x, y, diameter: d, angle: start + spun * offset, tint: spawnTint });
  }
  out.push({ kind: 'sprite', sprite: `s-${par}-ring-4`, x, y, diameter: d, angle: 0, tint: spawnTint });
  if (spec.strong && spec.colour !== 'white') {
    const c = SPAWN_COLOUR_RING.radius * size;
    const w = SPAWN_COLOUR_RING.width * size;
    out.push({ kind: 'ring', x, y, inner: c - w / 2, outer: c + w / 2, tint: palette.strong[spec.colour] });
  }
  if (t > 0) body(out, spec, x, y, size, st, palette, has, false, t);
}
