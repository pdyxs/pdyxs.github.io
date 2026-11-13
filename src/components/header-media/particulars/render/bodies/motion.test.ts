import { describe, expect, it } from 'vitest';
import { approach, clampUnit, crossfade, decayLeft, decayRing, indicatorAlpha, particleEyeGoal, playerEyeGoal, turnToward } from './motion';

describe('eye goals', () => {
  it("leans the player's layer along the steering, capped at full stick", () => {
    expect(playerEyeGoal({ x: 1, y: 0 }, 0.2, 1)).toEqual({ x: 0.2, y: 0 });
    const g = playerEyeGoal({ x: 3, y: 4 }, 0.2, 1);
    expect(Math.hypot(g.x, g.y)).toBeCloseTo(0.2);
    expect(playerEyeGoal({ x: 0, y: 0 }, 0.2, 1)).toEqual({ x: 0, y: 0 });
    expect(playerEyeGoal({ x: 0, y: -1 }, 0.2, 2)).toEqual({ x: 0, y: -0.4 });
  });

  it('looks a particle at the player, fully beyond a world unit away', () => {
    expect(particleEyeGoal({ x: 0, y: 0 }, { x: 10, y: 0 }, 0.3, 1)).toEqual({ x: 0.3, y: 0 });
    const near = particleEyeGoal({ x: 0, y: 0 }, { x: 0.5, y: 0 }, 0.3, 1);
    expect(near.x).toBeCloseTo(0.15);
  });

  it('clamps only vectors longer than one', () => {
    expect(clampUnit({ x: 0.3, y: 0.4 })).toEqual({ x: 0.3, y: 0.4 });
    expect(clampUnit({ x: 0, y: 2 })).toEqual({ x: 0, y: 1 });
  });
});

describe('approach', () => {
  it('lerps by dt × speed, clamped like Vector2.Lerp', () => {
    expect(approach({ x: 0, y: 0 }, { x: 1, y: 0 }, 0.1, 4)).toEqual({ x: 0.4, y: 0 });
    expect(approach({ x: 0, y: 0 }, { x: 1, y: 2 }, 1, 4)).toEqual({ x: 1, y: 2 });
    expect(approach({ x: 1, y: 1 }, { x: 0, y: 0 }, 0, 4)).toEqual({ x: 1, y: 1 });
  });

  it('settles on the goal over a second of frames', () => {
    let v = { x: 0, y: 0 };
    for (let i = 0; i < 60; i++) v = approach(v, { x: 0.2, y: 0 }, 1 / 60, 4);
    expect(v.x).toBeGreaterThan(0.19);
  });
});

describe('turnToward', () => {
  it('turns by at most the step, the short way round', () => {
    const v = turnToward({ x: 1, y: 0 }, { x: 0, y: 1 }, Math.PI / 4);
    expect(Math.atan2(v.y, v.x)).toBeCloseTo(Math.PI / 4);
    const w = turnToward({ x: 1, y: 0 }, { x: 0, y: -1 }, Math.PI);
    expect(Math.atan2(w.y, w.x)).toBeCloseTo(-Math.PI / 2);
  });
});

describe('decay ring', () => {
  it('starts as a thick inner band and thins to nothing at the rim', () => {
    expect(decayLeft(0, 10)).toBe(1);
    expect(decayLeft(5, 10)).toBe(0.5);
    expect(decayLeft(20, 10)).toBe(0);
    expect(decayRing(1, 1)).toEqual({ inner: 0.125, outer: 0.375 });
    const half = decayRing(1, 0.5);
    expect(half.outer).toBeCloseTo(0.4375);
    const none = decayRing(1, 0);
    expect(none.outer - none.inner).toBe(0);
  });
});

describe('crossfade', () => {
  it('fades the old layers out as the new fade in', () => {
    expect(crossfade(0)).toEqual({ from: 1, to: 0 });
    expect(crossfade(1)).toEqual({ from: 0, to: 1 });
    const mid = crossfade(0.5);
    expect(mid.from).toBeGreaterThan(0.5);
    expect(mid.to).toBeGreaterThan(0.5);
  });
});

describe('indicatorAlpha', () => {
  it('is faint without the weak force and recovers after an explosion with it', () => {
    expect(indicatorAlpha(false, 0.5, 0.2, 0.8)).toBe(0.2);
    expect(indicatorAlpha(true, 0, 0.2, 0.8)).toBe(0.8);
    expect(indicatorAlpha(true, 1, 0.2, 0.8)).toBe(0);
    expect(indicatorAlpha(true, 0.5, 0.2, 0.8)).toBeCloseTo(0.1);
  });
});
