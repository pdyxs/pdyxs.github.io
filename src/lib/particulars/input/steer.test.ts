import { describe, it, expect } from 'vitest';
import { steer } from './steer';

const origin = { x: 0, y: 0 };
const none = { pointers: [], keys: [] };

describe('steer', () => {
  it('is zero with nothing held', () => {
    expect(steer(none, origin)).toEqual({ x: 0, y: 0 });
  });

  it('a held pointer steers toward it, normalized however far', () => {
    expect(steer({ pointers: [{ x: 30, y: 0 }], keys: [] }, origin)).toEqual({ x: 1, y: 0 });
    const v = steer({ pointers: [{ x: 3, y: 4 }], keys: [] }, { x: 0, y: 0 });
    expect(v.x).toBeCloseTo(0.6);
    expect(v.y).toBeCloseTo(0.8);
  });

  it('a pointer exactly on the player contributes nothing', () => {
    expect(steer({ pointers: [{ x: 2, y: 2 }], keys: [] }, { x: 2, y: 2 })).toEqual({ x: 0, y: 0 });
  });

  it('arrow and WASD keys each contribute a unit vector (y is down)', () => {
    expect(steer({ pointers: [], keys: ['ArrowUp'] }, origin)).toEqual({ x: 0, y: -1 });
    expect(steer({ pointers: [], keys: ['d'] }, origin)).toEqual({ x: 1, y: 0 });
    expect(steer({ pointers: [], keys: ['S'] }, origin)).toEqual({ x: 0, y: 1 });
    expect(steer({ pointers: [], keys: ['ArrowLeft'] }, origin)).toEqual({ x: -1, y: 0 });
  });

  it('opposing inputs cancel to zero', () => {
    expect(steer({ pointers: [], keys: ['a', 'ArrowRight'] }, origin)).toEqual({ x: 0, y: 0 });
  });

  it('sums then normalizes, so a diagonal is not faster', () => {
    const v = steer({ pointers: [], keys: ['ArrowRight', 'ArrowDown'] }, origin);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
    expect(v.x).toBeCloseTo(Math.SQRT1_2);
  });

  it('mixes pointers and keys in the same sum', () => {
    // pointer vector (0, 1) + key (1, 0)
    const v = steer({ pointers: [{ x: 0, y: 1 }], keys: ['ArrowRight'] }, origin);
    expect(v.x).toBeCloseTo(Math.SQRT1_2);
    expect(v.y).toBeCloseTo(Math.SQRT1_2);
    // a far pointer outweighs a key: the sum is raw, only the result is normalized
    expect(steer({ pointers: [{ x: 0, y: 9 }], keys: ['ArrowRight'] }, origin).y).toBeGreaterThan(0.99);
  });
});
