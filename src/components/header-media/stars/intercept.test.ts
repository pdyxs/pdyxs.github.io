import { describe, it, expect } from 'vitest';
import { Planet } from './planet';
import { interceptTime } from './intercept';

describe('interceptTime', () => {
  const planet = new Planet({ r: 1, e: 0.2, angle: 30, period: 5, phase: 0.3 });

  it('finds a T where the ship and planet coincide', () => {
    const from = { x: 0, y: 4 };
    const speed = 2;
    const T = interceptTime(planet, 1.5, from, speed)!;
    expect(T).not.toBeNull();
    const p = planet.positionAt(1.5 + T);
    expect(Math.hypot(p.x - from.x, p.y - from.y)).toBeCloseTo(speed * T, 6);
  });

  it('is zero when the ship is already there', () => {
    const p = planet.positionAt(2);
    expect(interceptTime(planet, 2, p, 1)).toBe(0);
  });

  it('gives up when the ship is too slow to arrive in time', () => {
    expect(interceptTime(planet, 0, { x: 0, y: 4 }, 0.001, 1)).toBeNull();
  });
});
