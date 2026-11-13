// Colours and tunables for the charge layer: the original's "Topology" effect.
//
// Unity sources (~/dev/particulars/Assets):
// - Scripts/View/Entities/Particle/ParticleTopologyMesh.cs — one 25-unit quad per particle,
//   textured with Unity's built-in Default-Particle, charge clamped to ±(3 - 0.01) and squeezed
//   into 0..1 as charge / 6 + 0.5.
// - Art/Shaders/VisualEffects/Resources/Topology/topologyParticle{Add,Sub}.shader — additive
//   (Blend One One) into an 8-bit target: positives into red (q/6 · texAlpha), negatives into green.
// - .../Topology/topologyPostProcess.shader — charge = 0.5 + r - g, then
//   lerp(neutral, pos, (charge - 0.5) * 2) or lerp(neg, neutral, charge * 2). The lerp is not
//   clamped, so piled-up charge overshoots past the charge colour (to 2·pos − neutral at most).
// - Scripts/View/PostProcessing/{RenderTopology,CompositeScene}.cs — the camera is cleared with
//   `colourNeutral`, which is the level's background colour (BackgroundColourTween sets it).
// - Scripts/Model/Level/LevelTweens/ColourLevelTweens/{Background,Topology}ColourTween.cs and the
//   per-chapter gradients in Scenes/Levels/Progressions/*.asset tween the three colours per level.
//
// The shipped gradients (#0089ff / #ff002d on near-white backgrounds) went through the
// RenderSaturation post effect before reaching the screen, so the palettes below are measured
// straight off the trailer (Assets/Art/Video/Demo/demo_trailer.ogv) instead: what the player saw.

/**
 * The light-mode game surface: a warm-grey paper that sits on the site's white page.
 * The other layers design against this, so it is pinned here.
 */
export const LIGHT_BACKGROUND_HEX = '#e3e4e1';
/** The dark-mode game surface (graphite, measured off the trailer). */
export const DARK_BACKGROUND_HEX = '#3a3c3b';

export type Rgb = readonly [number, number, number];

export interface ChargePalette {
  /** The level background, and the colour where charge cancels out (`colourNeutral`). */
  neutral: Rgb;
  /** Full single-charge colour for positive charge (`colourPos`). */
  pos: Rgb;
  /** Full single-charge colour for negative charge (`colourNeg`). */
  neg: Rgb;
}

const hex = (h: string): Rgb => [
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255,
];

/**
 * Trailer 0:01–0:11, the dark graphite chapter ("Bring one up here…", the quark rows).
 * Neutral is the cleared background; pos is a lone up quark's glow (f_004, t = 2/3).
 * Neg is the deepest maroon of the electron crowd in f_011. (Read strictly, that plateau is
 * the overshoot 2·neg − neutral and a lone electron would be half as strong, #3b2931 — too
 * faint to read in a small toy), pushed a little further toward red so a lone electron reads
 * as clearly as a lone up quark without turning garish.
 */
export const GRAPHITE: ChargePalette = { neutral: hex(DARK_BACKGROUND_HEX), pos: hex('#80a4c3'), neg: hex('#561a2d') };

/** Trailer 0:12–0:16, the slate-purple chapter: an electron's deep red, the player's pale glow (f_015). */
export const SLATE: ChargePalette = { neutral: hex('#3d3b4a'), pos: hex('#77767e'), neg: hex('#761f28') };

/**
 * Trailer 0:17–0:20, the lavender chapter: the yellow ring of positive charge (f_019,
 * plateau = 2·pos − neutral). Its negative is never seen alone; the rose here is a guess
 * along the hue of the player's mixed glow.
 */
export const LAVENDER: ChargePalette = { neutral: hex('#68627f'), pos: hex('#8e8c76'), neg: hex('#8a4a68') };

/**
 * Light mode: the chapters' raw gradients (#0089ff positive, #ff002d negative, on near-white
 * backgrounds — Chapter 1/2/6/7/PAX .asset files), desaturated about halfway toward their
 * luminance as RenderSaturation did, and dark enough that a glow only ever darkens or tints the
 * paper. Overshoot (2·c − paper) runs toward deep blue / deep red, never toward white.
 */
export const PAPER: ChargePalette = { neutral: hex(LIGHT_BACKGROUND_HEX), pos: hex('#5486bd'), neg: hex('#bf4f5f') };

/** Light counterpart of SLATE: the same paper, its greyer positive and deeper red. */
export const PAPER_SLATE: ChargePalette = { neutral: hex(LIGHT_BACKGROUND_HEX), pos: hex('#6f7a90'), neg: hex('#a8343f') };

/** Light counterpart of LAVENDER: Chapter 3's #cec870 positive darkened to olive, a muted rose negative. */
export const PAPER_LAVENDER: ChargePalette = { neutral: hex(LIGHT_BACKGROUND_HEX), pos: hex('#9a9346'), neg: hex('#b05a80') };

/** A variant's palette pair; the site's theme picks one. */
export interface ThemedPalette {
  light: ChargePalette;
  dark: ChargePalette;
}

export const THEMED: Record<'graphite' | 'slate' | 'lavender', ThemedPalette> = {
  graphite: { light: PAPER, dark: GRAPHITE },
  slate: { light: PAPER_SLATE, dark: SLATE },
  lavender: { light: PAPER_LAVENDER, dark: LAVENDER },
};

/** Seconds to crossfade the palette when the site's theme flips. */
export const THEME_FADE_SECONDS = 0.35;

/** Half-width of each particle's topology quad: ParticleTopologyMesh.BaseRadius (25) / 2, world units. */
export const GLOW_RADIUS = 12.5;

/** Charge is clamped to ±(MaxChargeRange − 0.01) before encoding (ParticleTopologyMesh.ModZeroToOne). */
export const MAX_CHARGE = 3 - 0.01;
/** ...and divided by 2 · MaxChargeRange, so a lone electron at its centre writes 0.5. */
export const CHARGE_DIVISOR = 6;

/**
 * A particle's root transform scales 0 → 1 over Particle.changeTweenTime (EaseInCubic) when it
 * spawns and back to 0 when it dies, and the topology quad scales with it (Particle.cs).
 */
export const GROW_SECONDS = 0.5;

/**
 * Not in the original (its forces never switched mid-level): the glow is the EM field made
 * visible, so it fades with the toy's EM switch over this long.
 */
export const EM_FADE_SECONDS = 0.6;

/** Glows the shader loops over; anything past this is dropped (the toy runs ~30). */
export const MAX_GLOWS = 64;

/** 'soft': Gaussian width of each charge's field, world units (chosen to match the Unity footprint). */
export const SOFT_SIGMA = 4.5;
/** 'soft': tanh gain on the summed field (in units of e) before it is mapped to colour. */
export const SOFT_GAIN = 1.4;

/**
 * 'dust': RenderDust.cs + Prefabs/Effects/Dust.prefab — two particle systems of 600 specks,
 * 0.2 units across, living 5 s, drawn only where the strong-force mask (each particle's
 * ColourMesh, a 5-unit disc) has alpha. Here: one speck per DUST_CELL world-unit cell.
 */
export const DUST_CELL = 1.6;
export const DUST_SIZE = 0.2;
export const DUST_LIFE_SECONDS = 5;
export const DUST_MASK_RADIUS = 5;
export const DUST_ALPHA = 0.55;
/** Speck colour on the light paper (on the dark surface they stay white). */
export const DUST_ON_PAPER: Rgb = hex(DARK_BACKGROUND_HEX);
