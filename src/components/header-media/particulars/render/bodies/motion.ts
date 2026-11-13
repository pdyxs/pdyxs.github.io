// Pure: how the layers lean, and the other per-particle state the snapshot doesn't carry.

export interface Vec {
  x: number;
  y: number;
}

/** Shorten `v` to length 1 if it is longer (the original's `if (sqrMagnitude > 1) Normalize()`). */
export function clampUnit(v: Vec): Vec {
  const l2 = v.x * v.x + v.y * v.y;
  if (l2 <= 1) return { x: v.x, y: v.y };
  const l = Math.sqrt(l2);
  return { x: v.x / l, y: v.y / l };
}

/**
 * Where one of the player's layers wants to sit (PlayerEye.LateUpdate): along the steering input,
 * `maxMove` world units at full stick, times `lean` (1 = the original).
 */
export const playerEyeGoal = (steer: Vec, maxMove: number, lean: number): Vec => {
  const s = clampUnit(steer);
  return { x: s.x * maxMove * lean, y: s.y * maxMove * lean };
};

/**
 * Where one of a particle's layers wants to sit (ParticleEye.LateUpdate): looking at the player,
 * fully once the player is a world unit or more away, proportionally nearer.
 */
export const particleEyeGoal = (self: Vec, player: Vec, maxMove: number, lean: number): Vec => {
  const d = clampUnit({ x: player.x - self.x, y: player.y - self.y });
  return { x: d.x * maxMove * lean, y: d.y * maxMove * lean };
};

/**
 * One frame of the original's smoothing: `Vector2.Lerp(last, goal, dt * speed)`, whose t clamps
 * to [0, 1]. Frame-rate dependent, as in Unity; dt is clamped by the toy to 0.1 s.
 */
export function approach(last: Vec, goal: Vec, dt: number, speed: number): Vec {
  const t = Math.min(1, Math.max(0, dt * speed));
  return { x: last.x + (goal.x - last.x) * t, y: last.y + (goal.y - last.y) * t };
}

/** Rotate unit vector `from` toward `to` by at most `maxRadians` (Quaternion.RotateTowards in 2D). */
export function turnToward(from: Vec, to: Vec, maxRadians: number): Vec {
  const a = Math.atan2(from.y, from.x);
  const b = Math.atan2(to.y, to.x);
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const step = Math.max(-maxRadians, Math.min(maxRadians, d));
  return { x: Math.cos(a + step), y: Math.sin(a + step) };
}

/** How much of the decay time is left, 1 → 0 (WeakForceDecayView's `decayLeft`). */
export const decayLeft = (elapsedSeconds: number, decaySeconds: number): number =>
  Math.max(0, Math.min(1, 1 - elapsedSeconds / decaySeconds));

/**
 * The decay ring's band (WeakForceDecayView.Update): width = size/4 · left, centred at
 * size/2 − width, so a thick band that thins toward the rim. Returns inner/outer radii.
 */
export function decayRing(size: number, left: number): { inner: number; outer: number } {
  const width = (size / 4) * left;
  const centre = size / 2 - width;
  return { inner: centre - width / 2, outer: centre + width / 2 };
}

export const easeInQuad = (t: number): number => t * t;
export const easeInCubic = (t: number): number => t * t * t;
export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

/**
 * The crossfade when a particle changes (ParticleMesh.TweenMeshes): the old layers fade out
 * EaseInCubic and the new fade in EaseOutCubic over the change time. `t` is 0..1.
 */
export const crossfade = (t: number): { from: number; to: number } => {
  const c = Math.max(0, Math.min(1, t));
  return { from: 1 - easeInCubic(c), to: easeOutCubic(c) };
};

/**
 * The player indicator's alpha (PlayerIndicatorView): 0.2 without the weak force; with it, 0.8
 * scaled by (1 − cooldown left)³ after the player explodes.
 */
export function indicatorAlpha(weak: boolean, cooldownLeft: number, base: number, weakBase: number): number {
  if (!weak) return base;
  if (cooldownLeft <= 0) return weakBase;
  const a = 1 - Math.min(1, cooldownLeft);
  return weakBase * a * a * a;
}

/** Deterministic 0..1 from an integer, for per-particle randomness that survives re-renders. */
export function hash01(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
