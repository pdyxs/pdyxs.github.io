import type { PlanetData, Point } from "./types";

const TAU = Math.PI * 2;

export class Planet {
  constructor(data: PlanetData) {
    this.ra = data.r;
    this.e = data.e;
    this.angle = data.angle;
    this.period = data.period;
    this.phase = data.phase;

    this.rb = data.r * Math.sqrt(Math.abs(1 - data.e * data.e));
    this.offset = data.r * (1 - data.e) - data.r;
  }

  ra: number;
  rb: number;
  offset: number;
  e: number;
  angle: number;
  period: number;
  phase: number;

  /**
   * Position at time t, in the same coordinate space as the star (the star is
   * at the origin, at one focus of the ellipse). The orbit's tilt is already
   * applied, so the result needs no transform.
   *
   * Mean anomaly advances linearly with time; Kepler's equation turns it into
   * the eccentric anomaly E, which parametrises the ellipse directly.
   */
  positionAt(t: number): Point {
    const meanAnomaly = TAU * (this.phase + t / this.period);
    const E = solveKepler(meanAnomaly, this.e);

    // relative to the focus (the star), in the untilted orbit frame
    const x = this.ra * (Math.cos(E) - this.e);
    const y = this.rb * Math.sin(E);

    const tilt = (this.angle * Math.PI) / 180;
    const cos = Math.cos(tilt), sin = Math.sin(tilt);
    return { x: x * cos - y * sin, y: x * sin + y * cos };
  }
}

// Newton's method on E - e·sin(E) = M. Converges in a handful of steps for
// any e < 1; the loop cap is just a guard.
function solveKepler(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 20; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-9) break;
  }
  return E;
}
