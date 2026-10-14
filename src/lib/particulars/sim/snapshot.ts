/** Plain data the view reads each frame. Never contains physics objects. */
export interface Snapshot {
  tick: number;
  walls: { width: number; height: number };
  player: { x: number; y: number; radius: number };
}
