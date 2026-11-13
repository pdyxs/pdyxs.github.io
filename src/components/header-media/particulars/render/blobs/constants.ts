// Every blob colour and tunable, with the Unity file each came from.
// Unity: each particle (and the player) has a ParticleBlob child — a 64-point
// disc whose radius bulges toward what attracts it and dents toward what repels
// it. The blobs are drawn to an offscreen target, blurred, and a cutoff shader
// keeps only a band of the blurred alpha: an outline that hugs a lone particle
// and stretches across the gap between neighbours.

/** Points around each blob (Particle.prefab / Player.prefab ParticleBlob.numberOfPoints). */
export const BLOB_POINTS = 64;
/** A force's spread around the blob, degrees (ParticleBlob.forceSpreadDegrees). */
export const FORCE_SPREAD_DEGREES = 60;
/** Forces are scaled by this before the atan squash (ParticleBlob.magnitudeFactor, prefab value). */
export const MAGNITUDE_FACTOR = 0.2;
/** The smallest radius a dent can reach, world units (ParticleBlob.minRadius, prefab value). */
export const MIN_RADIUS = 0.001;
/** A new particle's blob grows from 0 to its radius over this long, ease-in cubic (Particle.changeTweenTime). */
export const GROW_SECONDS = 0.5;

/**
 * Outline colours as linear RGB 0..1 (GameScene.unity → RenderBlobs.blobColourPos /
 * blobColourNeg; the level XMLs tween them per level but start here). Matter
 * (parity +1, drawn light) gets the dark outline; antimatter (drawn dark) the light one.
 */
export const BLOB_COLOUR_POS = [0.15686275, 0.15686275, 0.15686275] as const;
export const BLOB_COLOUR_NEG = [0.88235295, 0.88235295, 0.88235295] as const;

/**
 * BlobCutoff.shader band (GameScene.unity RenderBlobs): the outline is where the
 * blurred alpha lies within CUTOFF_RADIUS ± CUTOFF_WIDTH/2, with an AA ramp of
 * AA_WIDTH either side. GameScene's radius is 0.5 (straddles the disc edge); the
 * Main Camera prefab's 0.35 sits a little outside it, which suits glyphs drawn
 * on top. Width is chosen so the line is ~0.1 world units, as in the trailer.
 */
export const CUTOFF_RADIUS = 0.35;
export const CUTOFF_WIDTH = 0.26;
export const AA_WIDTH = 0.06;

/**
 * Blur, world units (gaussian sigma). Unity: quarter-res target, 5 iterations
 * of BlobBlur's 4-tap at ~0.53 texels (RenderBlobs.blurIterations 5,
 * blurSpread 0) ≈ sigma 6.5 screen px at 1080p, where a world unit was ~42 px.
 */
export const BLUR_SIGMA = 0.155;
/** The 'unity' variant's offscreen target is this fraction of the canvas (RenderBlobs: Screen / 4). */
export const UNITY_DOWNSAMPLE = 4;

/** Analytic ('field') variant: the line's width, world units, and its iso level on the summed field. */
export const FIELD_LINE_WIDTH = 0.09;
export const FIELD_ISO = 0.35;
/** Not in the original: the analytic line never goes thinner than this many CSS px, so a small toy doesn't shimmer. */
export const MIN_LINE_CSS_PX = 1.5;

/** 'goo' variant: a softer field so neighbours web together from further apart. */
export const GOO_SIGMA = 0.28;
export const GOO_LINE_WIDTH = 0.11;
export const GOO_ISO = 0.3;

/** Upper bound on bodies drawn (particles + player). */
export const MAX_BODIES = 96;
