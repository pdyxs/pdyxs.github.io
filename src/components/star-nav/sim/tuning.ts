/** Every number the game's mechanic uses. Pure functions take one of these. */
export type Tuning = {
  /** Ship speed, in viewBox units per second of orbit time. */
  shipSpeed: number;
  /** Radius of the ship's turning circle, in viewBox units. */
  turnRadius: number;
  /** Most the ship can turn in one steering plan, in degrees. */
  turnCap: number;
};

export const defaultTuning: Tuning = {
  shipSpeed: 2,
  turnRadius: 1.5,
  turnCap: 55,
};
