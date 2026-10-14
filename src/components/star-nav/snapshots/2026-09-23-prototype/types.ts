export type Star = {
}

export type PlanetData = {
  //radius or semi-major axis, in AU
  r: number;

  //eccentricity of the elipse, between 0 and 1
  e: number;

  //Tilt of the elipse
  angle: number;

  //How long one full orbit takes, in whatever unit t is measured in
  period: number;

  //Where the planet is at t=0, as a fraction of the orbit (0–1).
  //0 is periapsis (closest to the star); this is a fraction of *time*,
  //not of angle, so the planet lingers near apoapsis as it should.
  phase: number;
}

export type Point = { x: number; y: number };
