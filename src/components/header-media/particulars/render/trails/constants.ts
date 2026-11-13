// Every tunable of the trails layer, copied from the Unity original
// (~/dev/particulars/Assets). World units are the original's: a down quark is 1.5 across.

/** An RGBA colour, components 0..1, straight (not premultiplied) alpha. */
export type Rgba = readonly [number, number, number, number];

// ---------------------------------------------------------------------------
// Colours. GameUI.prefab ships PosTrailColor / NegTrailColor as clear and the
// levels tween them in (TrailColourTween.cs); the trailer shows matter trails
// white and antimatter trails black, which is also what the Trail2 / Trail2Anti
// materials (Art/Game/Effects/Trail2*.mat, _Color white / black) are.
// ---------------------------------------------------------------------------
export const POS_TRAIL_COLOUR: Rgba = [1, 1, 1, 1];
export const NEG_TRAIL_COLOUR: Rgba = [0, 0, 0, 1];
/**
 * The player's body colour. PlayerColourTween.cs defaults to (55,179,74) green,
 * but every level in the trailer tweens it to this blue (sampled from the trailer).
 * Its trail colours are derived the way PlayerColourTween.Run does:
 * pos = lighten(0.95), neg = darken(0.8).
 */
export const PLAYER_COLOUR: Rgba = [60 / 255, 170 / 255, 230 / 255, 1];
export const PLAYER_LIGHTEN = 0.95;
export const PLAYER_DARKEN = 0.8;

// Light theme (the site's, not the original's: the original never ran on a light
// background). The charge layer paints ~#e3e4e1 paper; white strands vanish on it, so
// the roles swap: matter draws in the SVG's graphite ink, antimatter in white (pale,
// but still lifts off the paper). The player keeps its blue, deepened so it reads.
export const LIGHT_POS_TRAIL_COLOUR: Rgba = [0x3a / 255, 0x3c / 255, 0x3b / 255, 1];
export const LIGHT_NEG_TRAIL_COLOUR: Rgba = [1, 1, 1, 1];
/** Light-theme player: main = darken(PLAYER_COLOUR, this); inverse = the dark theme's near-white. */
export const LIGHT_PLAYER_DARKEN = 0.35;

// ---------------------------------------------------------------------------
// The multi-strand trail: Prefabs/GameObjects/Particles/Trail3Point0Pos.prefab
// (particles) and Trail2Point0Pos.prefab (player) — identical rigs. Two spinning
// parents (TrailView2point0.cs), each carrying TrailRenderers nudged about by
// TrailViewNudge.cs. Colour keys are the TrailRenderer's 5 m_Colors alphas
// (evenly spaced head → tail); widths lerp start → end over the trail's age.
// ---------------------------------------------------------------------------
export interface StrandDef {
  /** Which spinning parent carries it (index into SPIN_PARENTS). */
  parent: number;
  /** Local position in the parent; the nudged axis starts here. */
  x: number;
  y: number;
  /** TrailViewNudge: which axis wanders, and its Mathf.Clamp bounds (kept verbatim, min may exceed max). */
  nudgeX: boolean;
  min: number;
  max: number;
  /** TrailViewNudge.inverseColor: drawn in the opposite parity's colour. */
  inverse: boolean;
  /** TrailRenderer m_Time, seconds. */
  time: number;
  startWidth: number;
  endWidth: number;
  /** m_Colors alphas, head → tail. */
  alphas: readonly number[];
}

export interface SpinParentDef {
  /** degrees/second = clamp(base * |v| * 0.2, min, max)  (TrailView2point0.LateUpdate) */
  base: number;
  min: number;
  max: number;
}

export const SPIN_PARENTS: readonly SpinParentDef[] = [
  { base: 100, min: 50, max: 300 },
  { base: 500, min: 300, max: 900 },
];
export const SPIN_SPEED_FACTOR = 0.2;

const a = (...v: number[]) => v.map((x) => x / 255);
const BROAD = a(25, 50, 60, 12, 0);
const MAIN = a(138, 158, 125, 66, 0);
const ANTI = a(0, 68, 44, 31, 0);

export const STRANDS: readonly StrandDef[] = [
  { parent: 0, x: 0.2, y: 0, nudgeX: true, min: -0.2, max: 0.2, inverse: false, time: 1.2, startWidth: 0.6, endWidth: 0.65, alphas: BROAD },
  { parent: 1, x: 0.1, y: 0, nudgeX: true, min: 0.1, max: 0.05, inverse: false, time: 1, startWidth: 0.6, endWidth: 0.1, alphas: MAIN },
  { parent: 1, x: 0, y: 0.2, nudgeX: false, min: 0.05, max: 0.2, inverse: true, time: 1, startWidth: 0.15, endWidth: 0.1, alphas: ANTI },
  { parent: 1, x: 0, y: -0.2, nudgeX: false, min: -0.2, max: -0.05, inverse: true, time: 1, startWidth: 0.15, endWidth: 0.1, alphas: ANTI },
  { parent: 1, x: -0.1, y: 0, nudgeX: true, min: -0.1, max: -0.05, inverse: false, time: 1, startWidth: 0.6, endWidth: 0.1, alphas: MAIN },
];

/** TrailRenderer m_MinVertexDistance. */
export const MIN_VERTEX_DISTANCE = 0.1;
/** TrailViewNudge: velocity random walk (±1 per second²), clamped to ±0.1. */
export const NUDGE_ACCEL = 1;
export const NUDGE_MAX_VEL = 0.1;
/** TrailView2point0.dieTime: startWidth tweens to 0 over this when the particle goes. */
export const STRAND_DIE_SECONDS = 1.5;

/** A jump larger than this in one frame (respawn, wrap) breaks a trail instead of streaking across. */
export const TELEPORT_DISTANCE = 4;

// ---------------------------------------------------------------------------
// The single spline ribbon: TrailView.cs with Prefabs/.../Trail.prefab
// (particles) and PlayerTrail.prefab (player). Material Trail.mat on
// echoLogin-transparent-trail.shader (vertex colour × _Color, alpha blend).
// ---------------------------------------------------------------------------
export interface RibbonDef {
  saveTime: number;
  saveDist: number;
  saveDir: number;
  tension: number;
  fadeSize: number;
  evals: number;
  skewWeight: number;
  orthWeight: number;
  orthMult: number;
  skew: readonly [number, number];
  /** TimeCutoff: alpha = 1 - age / cutoff; points drop at 2 × cutoff. */
  cutoff: number;
  dieTime: number;
}
export const RIBBON_PARTICLE: RibbonDef = {
  saveTime: 0.5, saveDist: 0.6, saveDir: 0.9, tension: 0.4, fadeSize: 0.1, evals: 5,
  skewWeight: 1, orthWeight: 0.15, orthMult: 0.5, skew: [0, 0], cutoff: 2.5, dieTime: 2,
};
export const RIBBON_PLAYER: RibbonDef = {
  saveTime: 0.2, saveDist: 0.2, saveDir: 0.9, tension: 0.4, fadeSize: 0.1, evals: 3,
  skewWeight: 0.5, orthWeight: 0.1, orthMult: 0.4, skew: [0.7, 0.2], cutoff: 2.5, dieTime: 2,
};

// ---------------------------------------------------------------------------
// Permanent marks: PermaTrailsManager.cs / PermaTrailView.cs /
// ExplosionPermaView.cs. Each frame every particle stamps a segment from its
// last position into a never-cleared render texture with permaTrail-trail.shader
// (Blend DstColor Zero, One One: colour stays black, alpha adds), at a random
// per-particle depth with ZTest NotEqual so a particle never darkens its own
// mark twice. The texture is shown through PermaTrailMaterial.mat (white, a=0.1176).
// ---------------------------------------------------------------------------
/** Segment mesh is 1 wide (scaled by 0.2): solid across the middle half, fading to clear at the edges. */
export const PERMA_WIDTH = 0.2;
/** The segment starts this fraction of its length behind the previous position (mesh y from -0.1). */
export const PERMA_BACK = 0.1;
/** LineMaterial.mat _Color alpha (ordinary particles). */
export const PERMA_LINE_ALPHA = 0.0980392173;
/** NeutrinoLineMaterial.mat _Color alpha. */
export const PERMA_NEUTRINO_ALPHA = 0.588235319;
/** PermaTrailMaterial.mat _Color alpha: how dark a fully saturated mark shows. */
export const PERMA_DISPLAY_ALPHA = 0.117647059;
/** What colour the marks show in. The buffer stores only coverage, so a theme flip just recolours it. */
export const PERMA_MARK_RGB = { dark: [0, 0, 0], light: [0x3a / 255, 0x3c / 255, 0x3b / 255] } as const;
/** PermaTrailView: depth = Random.Range(0, 253). */
export const PERMA_DEPTH_LEVELS = 253;
/** permaTrail-explosion.shader: rim band alpha. The sphere writes (0,0,0,0) + rim: it wipes what's under it. */
export const PERMA_EXPLOSION_RIM_ALPHA = 0.2;
/** Texels per world unit of the mark buffer, capped so neither side exceeds PERMA_MAX_TEXELS. Unity used 1024² over the level. */
export const PERMA_TEXELS_PER_UNIT = 64;
export const PERMA_MAX_TEXELS = 2048;
