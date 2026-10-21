/** Every Particulars tunable, in one place. Values are the Unity original's unless a comment says otherwise. */

/**
 * Fixed simulation step, seconds. Unity's `Time.fixedDeltaTime` (0.02): the
 * original's force strengths are per-step quantities, so this is not free to retune.
 */
export const FIXED_DT = 0.02;
/** Cap on steps per frame, so a long stall cannot spiral. */
export const MAX_STEPS_PER_FRAME = 5;

export const VELOCITY_ITERATIONS = 8;
export const POSITION_ITERATIONS = 3;

/**
 * Particle sizes, copied from the original's ParticleConstants.xml. A particle's
 * collider radius is size / 2 and its mass is pi * radius^2 (`radiusOf`, `massOf`).
 */
export const SIZE_BY_TYPE = {
  up: 1.06, down: 1.5, strange: 2.6, charm: 4, top: 12, bottom: 7,
  electron: 0.7, muon: 2.15, tau: 2.8,
  electronNeutrino: 0.7, muonNeutrino: 0.7, tauNeutrino: 0.7,
  W: 2.56,
} as const;

export const radiusOf = (type: keyof typeof SIZE_BY_TYPE): number => SIZE_BY_TYPE[type] / 2;
export const massOf = (type: keyof typeof SIZE_BY_TYPE): number => Math.PI * radiusOf(type) ** 2;

/**
 * The player's thrust, from the original's Player prefab: `acceleration` along
 * the current velocity, `deceleration` across it (see `playerThrust`). Unity
 * adds `value * Time.deltaTime` as a force each frame, so the steady force on
 * the body is value * the fixed step. The player body has no linear drag.
 */
export const PLAYER_ACCELERATION = 2000;
export const PLAYER_DECELERATION = 2800;
/** Per-type multiplier on the player's thrust (ParticleConstants.xml `playerForceCoefficients`). */
export const PLAYER_FORCE_COEFFICIENT_BY_TYPE = {
  up: 1, down: 1, strange: 1.1, charm: 1.5, top: 7, bottom: 4,
  electron: 1, muon: 1, tau: 1,
  electronNeutrino: 1, muonNeutrino: 1, tauNeutrino: 1,
  W: 1,
} as const;

/** The original's physics materials: Particle (particles and the player) and wall. */
export const PARTICLE_RESTITUTION = 0.25;
export const PARTICLE_FRICTION = 0;
export const WALL_RESTITUTION = 0.5;
export const WALL_FRICTION = 0.75;

/** Wall slab thickness, world units. */
export const WALL_THICKNESS = 2;
/** An arc wall is built from one collision box per this many degrees of sweep. */
export const ARC_PIECE_DEGREES = 15;
/** Margin around the box inside the SVG viewBox, world units. */
export const VIEW_MARGIN = 0.5;

/**
 * Forces, as in ParticleWorldConstants.cs. Each is multiplied by FIXED_DT where
 * applied and the result is a force, so acceleration is that over the mass.
 */
/** EM force = EM_STRENGTH * dt * q1 * q2 / d, charges in thirds of e. */
export const EM_STRENGTH = 500;
/** Strong force = COLOUR_STRENGTH * dt, constant with distance; doubled between same colours. */
export const COLOUR_STRENGTH = 500;
/** Gravity force = GRAVITY_STRENGTH * dt * blackHoleMass * particleMass / d^2. */
export const GRAVITY_STRENGTH = 2000;
/** Black hole radius = sqrt(mass / (BLACK_HOLE_DENSITY * pi)), as in Unity. */
export const BLACK_HOLE_DENSITY = 1;
/** Charge per particle type, in thirds of e (a down quark is -1). Parity flips the sign. */
export const CHARGE_BY_TYPE = {
  up: 2, down: -1, strange: -1, charm: 2, top: 2, bottom: -1,
  electron: -3, muon: -3, tau: -3,
  electronNeutrino: 0, muonNeutrino: 0, tauNeutrino: 0,
  W: 3,
} as const;

/** Horizontal spacing of the forces readout, world units. */
export const FORCE_LABEL_SPACING = 3.2;

/**
 * Weak force numbers, from ParticleConstants.xml and Particle.cs. A type absent
 * from DECAY_TIME_BY_TYPE is stable. The decay timer runs from a particle's
 * spawn and is never reset by a change, so a particle can decay again the moment
 * it changes to a type with a shorter time.
 */
export const DECAY_TIME_BY_TYPE = {
  strange: 24, charm: 14, top: 7, bottom: 16, muon: 15, tau: 8, W: 5,
} as const;
/** Speed a decay shoots its W out at (the W's `decayExp`) and the recoil by the emitter's type (`decayExp`). */
export const DECAY_EXPULSION_BY_TYPE = {
  up: 0, down: 0, strange: 5, charm: 5, top: 5, bottom: 5,
  electron: 10, muon: 2, tau: 2,
  electronNeutrino: 0, muonNeutrino: 0, tauNeutrino: 0,
  W: 5,
} as const;
/** The same for a player-initiated change (`sidegradeExp`). */
export const SIDEGRADE_EXPULSION_BY_TYPE = {
  up: 10, down: 10, strange: 8, charm: 8, top: 5, bottom: 5,
  electron: 0, muon: 0, tau: 0,
  electronNeutrino: 0, muonNeutrino: 0, tauNeutrino: 0,
  W: 5,
} as const;
/** How long a particle takes to change type: its size and mass tween, and it ignores contacts meanwhile. */
export const CHANGE_TWEEN_SECONDS = 0.5;
/** A W is immune to its emitter, and the emitter's forces are off, until this old (seconds). */
export const BOSON_ABSORB_AGE_ENTER = 0.8;
export const BOSON_ABSORB_AGE_STAY = 1;
/** Neutrinos fly at this speed and are destroyed half a second after they should have hit the bounds. */
export const NEUTRINO_SPEED = 100;
export const NEUTRINO_EXTRA_LIFE_SECONDS = 0.5;
/** How fast a W turns to face the nearest opposite-charged particle, degrees per second. */
export const W_TURN_DEGREES_PER_SECOND = 360;
/** The mass a W body starts at while it grows to full size. */
export const GROWING_BOSON_START_MASS = 1;
