import { describe, it, expect } from 'vitest';
import { explosionDone, explosionPush, explosionRadius, maxRadius } from './explosions';
import { EXPLOSION_RADIUS_MULT, EXPLOSION_SECONDS, EXPLOSION_STRENGTH, FIXED_DT } from '../constants';

const at = (age: number, over = {}) => ({ x: 0, y: 0, initial: 0, size: 1, age, ...over });

describe('explosion radius', () => {
  it('starts at its initial size and reaches the maximum after its time, growing as sqrt(t)', () => {
    expect(explosionRadius(at(0, { initial: 1.5 }))).toBe(1.5);
    expect(maxRadius(at(0, { initial: 1.5, size: 1.5 }))).toBeCloseTo(1.5 + EXPLOSION_RADIUS_MULT * 1.5);
    expect(explosionRadius(at(EXPLOSION_SECONDS))).toBeCloseTo(EXPLOSION_RADIUS_MULT);
    // a quarter of the time is half the growth
    expect(explosionRadius(at(EXPLOSION_SECONDS / 4))).toBeCloseTo(EXPLOSION_RADIUS_MULT / 2);
  });

  it('is done once it passes its maximum', () => {
    expect(explosionDone(at(EXPLOSION_SECONDS * 0.99))).toBe(false);
    expect(explosionDone(at(EXPLOSION_SECONDS * 1.01))).toBe(true);
  });
});

describe('explosion push', () => {
  it('pushes away from the centre by strength * dt / sqrt(radius)', () => {
    const e = at(EXPLOSION_SECONDS / 4); // radius 4
    const push = explosionPush(e, { x: 3, y: 0 });
    expect(push.x).toBeCloseTo((EXPLOSION_STRENGTH * FIXED_DT) / 2);
    expect(push.y).toBeCloseTo(0);
    expect(explosionPush(e, { x: 0, y: -3 }).y).toBeLessThan(0);
  });

  it('does nothing outside the radius, before it has grown, or once finished', () => {
    expect(explosionPush(at(EXPLOSION_SECONDS / 4), { x: 5, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(explosionPush(at(0), { x: 0.1, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(explosionPush(at(EXPLOSION_SECONDS * 2), { x: 1, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});
