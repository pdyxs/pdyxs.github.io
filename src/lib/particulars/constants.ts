/** Every Particulars tunable, in one place. Planck needs re-feeling against Unity. */

/** Fixed simulation step, seconds. */
export const FIXED_DT = 1 / 60;
/** Cap on steps per frame, so a long stall cannot spiral. */
export const MAX_STEPS_PER_FRAME = 5;

export const VELOCITY_ITERATIONS = 8;
export const POSITION_ITERATIONS = 3;

/** Thrust applied to the player at full steer, in force units (mass 1 => m/s^2). */
export const STEER_FORCE = 20;
/** Linear damping on the player; sets top speed (about STEER_FORCE / DAMPING = 5 units/s) and stopping. */
export const PLAYER_DAMPING = 4;
export const PLAYER_DENSITY = 1;
export const PLAYER_RESTITUTION = 0.3;
export const PLAYER_FRICTION = 0;

/** Wall slab thickness, world units. */
export const WALL_THICKNESS = 2;
/** An arc wall is built from one collision box per this many degrees of sweep. */
export const ARC_PIECE_DEGREES = 15;
/** Margin around the box inside the SVG viewBox, world units. */
export const VIEW_MARGIN = 0.5;

/** Non-player particles. One size for all 12 types for now. */
export const PARTICLE_RADIUS = 0.35;
export const PARTICLE_DENSITY = 1;
export const PARTICLE_RESTITUTION = 1;
export const PARTICLE_FRICTION = 0;

/**
 * Forces. Unity's values (EM 500, colour 500, gravity 2000) were force * fixedDt
 * on bodies of differing mass; these are accelerations (uniform mass), re-felt
 * for planck against the 20-unit steer thrust.
 */
/** EM acceleration = EM_STRENGTH * q1 * q2 / d, charges in thirds of e. */
export const EM_STRENGTH = 2;
/** Strong acceleration, constant with distance; doubled between same colours. */
export const COLOUR_STRENGTH = 5;
/** Gravity acceleration = GRAVITY_STRENGTH * blackHoleMass / d^2. */
export const GRAVITY_STRENGTH = 5;
/** Distances below this are treated as this, so 1/d and 1/d^2 stay finite. */
export const MIN_FORCE_DISTANCE = 0.25;
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
 * Seconds a type lives before the weak force decays it. Types absent here are
 * stable. Each decay steps down a generation and sheds a W (Unity: decayTimes).
 */
export const DECAY_TIME_BY_TYPE = {
  top: 4, bottom: 6, charm: 6, strange: 8, muon: 6, tau: 4,
} as const;
/** Speed a W leaves an emitting particle at, and the recoil the emitter takes opposite it. */
export const W_SPEED = 4;
export const W_RECOIL = 1;
/** Gap between an emitter and the W it sheds, so the W starts clear of it. */
export const W_CLEARANCE = 0.05;
