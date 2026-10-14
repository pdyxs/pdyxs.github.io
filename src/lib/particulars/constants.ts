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
/** Margin around the box inside the SVG viewBox, world units. */
export const VIEW_MARGIN = 0.5;
