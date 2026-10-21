/**
 * How long a stop lasts. `distance` scales with how far the ship is from the
 * planet when the stop begins.
 */
export type StopRule =
  | { mode: 'none' }
  | { mode: 'constant'; length: number }
  | { mode: 'distance'; perUnit: number };

/** Every number the game's mechanic uses. Pure functions take one of these. */
export type Tuning = {
  /** Ship speed, in viewBox units per second of orbit time. */
  shipSpeed: number;
  /** Radius of the ship's turning circle, in viewBox units. */
  turnRadius: number;
  /** Most the ship can turn in one steering plan, in degrees. */
  turnCap: number;
  /** Gravitational parameter of a planet is `massScale * planet.mass`. */
  massScale: number;
  /** Softening length of the pull; keeps a pass through the core finite. */
  gravitySoftening: number;
  /** Integration time step of an encounter, in seconds of orbit time. */
  encounterStep: number;
  /** How far before the planet (local y) an encounter simulation begins. */
  encounterStart: number;
  /** Distance from the planet at which the slingshot starts and ends. */
  slingshotRadius: number;
  /** How long a stop lasts. */
  stopRule: StopRule;
  /**
   * The choice point may be no further before the planet than
   * `keepFactor * stopLength`. 0 turns the limit off.
   */
  keepFactor: number;
  /** The fraction of the box's width a drag spans to reach the full range. */
  dragRange: number;
  /** The widest pass the drag can ask for, in viewBox units. */
  maxOffset: number;
  /** The commitment a drag starts from, before it moves along the approach. */
  defaultCommit: number;
  /** How far a touch may wobble on touch-down and still be a tap, in px. */
  touchDeadPx: number;
};

export const defaultTuning: Tuning = {
  shipSpeed: 2,
  turnRadius: 1.5,
  turnCap: 55,
  massScale: 0.1,
  gravitySoftening: 0.1,
  encounterStep: 0.005,
  encounterStart: 1.5,
  slingshotRadius: 1,
  stopRule: { mode: 'constant', length: 0.5 },
  keepFactor: 0.75,
  dragRange: 0.3,
  maxOffset: 1,
  defaultCommit: 0.5,
  touchDeadPx: 8,
};
