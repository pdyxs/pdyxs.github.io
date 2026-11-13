// Colours and tunables for the bodies layer: the original's layered particle sprites.
//
// Unity sources (~/dev/particulars/Assets):
// - Scripts/View/Util/ParticleMeshUtil.cs — which material each of the six layers gets, and the
//   player's per-layer shade.
// - Scripts/View/Entities/ParticleViewConstants/ParticleViewConstants.cs — the sprite for a
//   (type, parity, layer, isPlayer), and the layer-1 glow's charge colours (`UpdateMeshColours`).
// - Scenes/GameScene.unity, the ParticleView object — the eye tables below.
// - Art/Game/Particles/Atlas/ParticleAtlas_*.mat, Scenes/Levels/Progressions/Chapter *.asset —
//   colours (materials as authored, then the per-chapter gradients the level tweens apply).

export type Rgba = readonly [number, number, number, number];

const hex = (h: string, a = 1): Rgba => [
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255,
  a,
];

export interface BodiesPalette {
  /** PlayerColourMaterial: multiplies the player's iris layers (2–4) and its indicator rings. */
  player: Rgba;
  /** Layer-1 glow tint for positive / negative charge (RenderTopology colourPos / colourNeg). */
  glowPos: Rgba;
  glowNeg: Rgba;
  /** The pupil (layer 5) under the strong force: _Red/_Green/_BlueColourMaterial. */
  strong: { red: Rgba; green: Rgba; blue: Rgba };
  /**
   * Not in the original: an ink rim drawn under each body, as a fraction of its radius, out from
   * the edge outward. The original's white bodies only sat on mid-to-dark backgrounds (in the trailer,
   * #3a3c3b up to the lavender #68627f, always with the blob's dark outline); on the site's light
   * paper a white sprite vanishes, so light mode rims every body in the page's graphite ink.
   * `maxWidth` (world units) keeps the big quarks' rims as fine as the small ones'.
   */
  rim: { tint: Rgba; width: number; maxWidth: number } | null;
  /**
   * Tint for the white (matter) spawn spinners and ring. White on dark; on light paper the white
   * sprites vanish, so a mid graphite that stays lighter than an antiparticle's black set.
   */
  spawnMatter: Rgba;
  /** The decay ring on a W (white on dark; WeakForceDecayView.bosonAlpha). */
  decayBoson: Rgba;
}

/** The site's light-mode ink and the charge layer's light paper, for reference. */
export const INK = '#3a3c3b';
export const LIGHT_PAPER = '#e3e4e1';

/**
 * The glow's charge colours as the player saw them. The gradients say #0089ff / #ff002d, but the
 * frame then went through RenderSaturation, and on screen (the trailer) a quark's glow is a pale
 * steel blue or a dusty red: the charge layer's measurements (charge/palette.ts GRAPHITE.pos,
 * SLATE.neg), copied rather than imported to keep the layers independent.
 */
const GLOW_POS = '#80a4c3';
const GLOW_NEG = '#761f28';
/** Light mode's glows: the charge layer's light paper palette (charge/palette.ts PAPER.pos / .neg). */
const LIGHT_GLOW_POS = '#5486bd';
const LIGHT_GLOW_NEG = '#bf4f5f';

/**
 * The shipped game. Player: the PlayerColour gradient of Chapters 1–2 (#37b34a; PlayerColourTween's
 * default too). Glow at the 0.5 alpha UpdateMeshColours gives it. Strong: the
 * Red/Green/BlueStrongColour gradients, which are pure primaries.
 */
export const UNITY: BodiesPalette = {
  player: hex('#37b34a'),
  glowPos: hex(GLOW_POS, 0.5),
  glowNeg: hex(GLOW_NEG, 0.5),
  strong: { red: hex('#ff0000'), green: hex('#00ff00'), blue: hex('#0000ff') },
  rim: null,
  spawnMatter: hex('#ffffff'),
  decayBoson: hex('#ffffff', 0.5),
};

/**
 * The trailer (Art/Video/Demo/demo_trailer.ogv), an older build: the player's iris is a sky blue
 * (measured off frame 0:00.5, the brightest unblended pixels), and the strong colours are the
 * materials as authored (ParticleAtlas_Colour{Red,Green,Blue}.mat), which read better on grey.
 */
export const TRAILER: BodiesPalette = {
  player: hex('#36a6dc'),
  glowPos: hex(GLOW_POS, 0.5),
  glowNeg: hex(GLOW_NEG, 0.5),
  strong: { red: hex('#b00404'), green: hex('#098109'), blue: hex('#0084ff') },
  rim: null,
  spawnMatter: hex('#ffffff'),
  decayBoson: hex('#ffffff', 0.5),
};

/**
 * Light mode: everything above, plus what light paper needs. The strong colours are the authored
 * materials (deep enough to read on a white pupil against light paper; the pure #00ff00 does not),
 * the player's green is deepened so its iris holds against the white body, and the glows follow
 * the charge layer's light palette (charge/palette.ts PAPER; copied, not imported).
 */
const LIGHT_EXTRAS = {
  glowPos: hex(LIGHT_GLOW_POS, 0.5),
  glowNeg: hex(LIGHT_GLOW_NEG, 0.5),
  strong: TRAILER.strong,
  rim: { tint: hex(INK, 0.55), width: 0.09, maxWidth: 0.07 },
  spawnMatter: hex(INK, 0.55),
  decayBoson: hex(INK, 0.45),
} as const;

export const UNITY_LIGHT: BodiesPalette = { ...UNITY, ...LIGHT_EXTRAS, player: hex('#2a9a3c') };
export const TRAILER_LIGHT: BodiesPalette = { ...TRAILER, ...LIGHT_EXTRAS, player: hex('#1f8cc2') };

export type Theme = 'light' | 'dark';
export interface ThemedPalette {
  dark: BodiesPalette;
  light: BodiesPalette;
}

/** Pure: the palette for the site's current mode. */
export const paletteFor = (set: ThemedPalette, theme: Theme): BodiesPalette => (theme === 'dark' ? set.dark : set.light);

/** The W's glow is opaque and darkened by 0.2 (ParticleViewConstants.UpdateMeshColours). */
export const W_GLOW_ALPHA = 1;
export const W_GLOW_DARKEN = 0.2;

/**
 * Sprite names in the original atlas: `<name><layer>`, `<anti><layer>`, `<name><layer>player`
 * (Scenes/Config/View/Particle/ParticleViewData.asset).
 */
export const SPRITE_NAMES = {
  up: ['up', 'aup'],
  down: ['down', 'adown'],
  strange: ['strange', 'astrange'],
  charm: ['charm', 'acharm'],
  top: ['top', 'atop'],
  bottom: ['bottom', 'abottom'],
  electron: ['electron', 'positron'],
  muon: ['muon', 'amuon'],
  tau: ['tau', 'atau'],
  W: ['pwboson', 'nwboson'],
  electronNeutrino: ['neutrino', 'neutrino'],
  muonNeutrino: ['neutrino', 'neutrino'],
  tauNeutrino: ['neutrino', 'neutrino'],
} as const;

/** How far each layer leans, world units, per type then layer 0..5 (`particleEyeMaxMove`). */
export const PARTICLE_EYE_MAX_MOVE = {
  up: [0, 0.14, 0.14, 0.14, 0.19, 0.22],
  down: [0, 0.2, 0.2, 0.2, 0.28, 0.32],
  strange: [0, 0.34, 0.38, 0.5, 0, 0.6],
  charm: [0, 0.45, 0.5, 0, 0, 0.65],
  top: [0, 0.2, 0, 0.45, 0, 0.7],
  bottom: [0, 0.2, 0.4, 0.6, 0.8, 1],
  electron: [0, 0.1, 0.1, 0.1, 0.12, 0.16],
  muon: [0, 0.2, 0.2, 0.2, 0.28, 0.32],
  tau: [0, 0.2, 0.2, 0.2, 0.28, 0.32],
  W: [0, 0, 0.2, 0.2, 0.28, 0.32],
  electronNeutrino: [0, 0, 0, 0, 0, 0],
  muonNeutrino: [0, 0, 0, 0, 0, 0],
  tauNeutrino: [0, 0, 0, 0, 0, 0],
} as const;

/** `playerEyeMaxMove`: the same as the particles' except the W's glow leans too. */
export const PLAYER_EYE_MAX_MOVE = { ...PARTICLE_EYE_MAX_MOVE, W: [0, 0.2, 0.2, 0.2, 0.28, 0.32] } as const;

/** How fast each layer catches up, per second (`particleEyeMoveSpeed` = `playerEyeMoveSpeed`, every type). */
export const EYE_MOVE_SPEED = [0, 4, 4, 4, 5, 6] as const;

/** Player layers that are lightened (ParticleMeshUtil.shadeAmount), keyed `type:layer`. */
export const PLAYER_SHADE: Readonly<Record<string, number>> = {
  'top:3': 0.1,
  'bottom:3': 0.4,
  'bottom:2': 0.6,
  'strange:2': 0.5,
};

/**
 * Weak decay timer (WeakForceDecayView, Particle/Player prefabs): a ring inside the body that
 * thins toward the rim as the decay comes due. Colours as the prefab sets them.
 */
export const DECAY_RING = {
  anti: [1, 1, 1, 0.2] as Rgba,
  matter: [0, 0, 0, 0.3] as Rgba,
};

/**
 * Spawn telegraph (SpawnerView.cs, Prefabs/GameObjects/Other/SpawnPoint.prefab): a ring the size
 * of the particle, five petal spinners behind it that spin up (EaseInQuad to MaxSpeed 600°/s, each
 * at a random 0.8–2× speed), and the particle's own layers growing from nothing in front.
 */
export const SPAWN_SPIN_MAX_DEG_PER_S = 600;
export const SPAWN_SPIN_OFFSET_RANGE = [0.8, 2] as const;
/** The strong-colour ring around a coloured spawn: MeshArc radius .42, width .04, × size. */
export const SPAWN_COLOUR_RING = { radius: 0.42, width: 0.04 } as const;
/**
 * The snapshot does not say how long a telegraph lasts, so its progress is the time since we first
 * saw it over this. The toy's scenarios use 0.5–1.5 s.
 */
export const ASSUMED_TELEGRAPH_SECONDS = 1;

/**
 * Player indicator (PlayerIndicatorView, Player prefab): two faint rings in the player's colour,
 * scaled by (size + PlayerExplosion.maxRadiusMult 3.5); alpha 0.2, or 0.8 with the weak force on,
 * fading back in (cubed) over the explosion cooldown after the player explodes.
 */
export const PLAYER_INDICATOR = {
  scaleAdd: 3.5,
  rings: [
    { radius: 0.3, width: 0.05, alpha: 0.635 },
    { radius: 0.7, width: 0.1, alpha: 0.361 },
  ],
  alpha: 0.2,
  weakAlpha: 0.8,
} as const;
