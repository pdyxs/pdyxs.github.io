import { describe, it, expect } from 'vitest';
import { clientToWorld, hitsPlayer } from './pointer';

describe('clientToWorld', () => {
  it('maps client pixels through the element rect into viewBox world units', () => {
    const rect = { left: 100, top: 50, width: 400, height: 200 };
    const view = { x: -10, y: -5, width: 20, height: 10 };
    expect(clientToWorld({ x: 100, y: 50 }, rect, view)).toEqual({ x: -10, y: -5 });
    expect(clientToWorld({ x: 300, y: 150 }, rect, view)).toEqual({ x: 0, y: 0 });
    expect(clientToWorld({ x: 500, y: 250 }, rect, view)).toEqual({ x: 10, y: 5 });
  });
});

describe('hitsPlayer', () => {
  it('is true within the player radius (the future action seam; such a press never steers)', () => {
    const player = { x: 1, y: 1, radius: 0.5 };
    expect(hitsPlayer({ x: 1.3, y: 1 }, player)).toBe(true);
    expect(hitsPlayer({ x: 2, y: 1 }, player)).toBe(false);
  });
});
