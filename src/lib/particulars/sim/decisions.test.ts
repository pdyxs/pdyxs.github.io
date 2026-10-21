import { describe, it, expect } from 'vitest';
import { playerThrust } from './decisions';

const RIGHT = { x: 1, y: 0 };
const AT_REST = { x: 0, y: 0 };

// Player prefab: acceleration 2000, deceleration 2800; Unity adds value * deltaTime, so * the 0.02 step.
describe('playerThrust', () => {
  it('is zero without steering', () => {
    expect(playerThrust(AT_REST, { x: 3, y: 0 }, 1)).toEqual({ x: 0, y: 0 });
  });
  it('from rest, pushes with the acceleration: 2000 * 0.02 = 40', () => {
    expect(playerThrust(RIGHT, AT_REST, 1)).toEqual({ x: 40, y: 0 });
  });
  it('along the velocity, pushes with the acceleration', () => {
    expect(playerThrust(RIGHT, { x: 5, y: 0 }, 1).x).toBeCloseTo(40, 10);
  });
  it('across the velocity, pushes with the deceleration: 2800 * 0.02 = 56', () => {
    expect(playerThrust({ x: 0, y: 1 }, { x: 5, y: 0 }, 1).y).toBeCloseTo(56, 10);
  });
  it('against the velocity, pushes hardest: (-2000 + 2 * 2800) * 0.02 = 72', () => {
    expect(playerThrust({ x: -1, y: 0 }, { x: 5, y: 0 }, 1).x).toBeCloseTo(-72, 10);
  });
  it('scales with the particle type coefficient', () => {
    expect(playerThrust(RIGHT, AT_REST, 7).x).toBeCloseTo(280, 10);
  });
});

import { distanceToBox, easeInCubic, easeOutQuint, rotateToward, tweenAt, upgradedVelocity } from './decisions';

describe('easing and tweens', () => {
  it('EaseInCubic starts slow, EaseOutQuint starts fast, both span 0..1', () => {
    expect(easeInCubic(0)).toBe(0);
    expect(easeInCubic(1)).toBe(1);
    expect(easeInCubic(0.5)).toBeCloseTo(0.125, 10);
    expect(easeOutQuint(0.5)).toBeCloseTo(1 - 0.5 ** 5, 10);
  });
  it('a tween holds its ends outside its span', () => {
    const t = { from: 2, to: 4, start: 10, ticks: 20 };
    expect(tweenAt(t, 0, easeInCubic)).toBe(2);
    expect(tweenAt(t, 20, easeInCubic)).toBeCloseTo(2 + 2 * 0.125, 10);
    expect(tweenAt(t, 99, easeInCubic)).toBe(4);
  });
});

describe('distanceToBox', () => {
  it('is how far a ray goes before leaving the box', () => {
    expect(distanceToBox({ x: 0, y: 0 }, { x: 1, y: 0 }, 20, 10)).toBe(10);
    expect(distanceToBox({ x: 4, y: 0 }, { x: -1, y: 0 }, 20, 10)).toBe(14);
    expect(distanceToBox({ x: 0, y: 0 }, { x: 0, y: -1 }, 20, 10)).toBe(5);
    expect(distanceToBox({ x: 0, y: 0 }, { x: Math.SQRT1_2, y: Math.SQRT1_2 }, 20, 10)).toBeCloseTo(5 / Math.SQRT1_2, 10);
  });
});

describe('rotateToward', () => {
  it('turns the short way, at most the given angle', () => {
    const r = rotateToward({ x: 1, y: 0 }, { x: 0, y: 1 }, 0.1);
    expect(Math.atan2(r.y, r.x)).toBeCloseTo(0.1, 10);
    const back = rotateToward({ x: 1, y: 0 }, { x: -1, y: -0.001 }, 0.1);
    expect(Math.atan2(back.y, back.x)).toBeCloseTo(-0.1, 10);
  });
  it('lands on the target when it is within reach', () => {
    const r = rotateToward({ x: 1, y: 0 }, { x: 0, y: 5 }, 3);
    expect(r.x).toBeCloseTo(0, 10);
    expect(r.y).toBeCloseTo(1, 10);
  });
});

describe('upgradedVelocity', () => {
  it('shares momentum between the particle and the boson it absorbs', () => {
    const v = upgradedVelocity({ v: { x: 2, y: 0 }, mass: 3 }, { v: { x: -4, y: 4 }, mass: 1 }, 2);
    expect(v).toEqual({ x: 1, y: 2 });
  });
});
