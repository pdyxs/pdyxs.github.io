import { describe, it, expect } from 'vitest';
import { inCone } from './cone';

describe('inCone', () => {
  const apex = { x: 0, y: 4 };

  it('accepts a point straight ahead', () => {
    expect(inCone(apex, 0, 40, 15, { x: 0, y: 0 })).toBe(true);
  });

  it('rejects a point behind', () => {
    expect(inCone(apex, 0, 40, 15, { x: 0, y: 6 })).toBe(false);
  });

  it('respects the half-angle either side', () => {
    // 19° and 21° off the axis, cone is ±20°
    const off = (deg: number) => ({ x: Math.tan((deg * Math.PI) / 180) * 4, y: 0 });
    expect(inCone(apex, 0, 40, 15, off(19))).toBe(true);
    expect(inCone(apex, 0, 40, 15, off(-19))).toBe(true);
    expect(inCone(apex, 0, 40, 15, off(21))).toBe(false);
  });

  it('follows the heading', () => {
    // heading 90 = pointing right (+x)
    expect(inCone(apex, 90, 40, 15, { x: 3, y: 4 })).toBe(true);
    expect(inCone(apex, 90, 40, 15, { x: 0, y: 0 })).toBe(false);
  });

  it('rejects a point beyond the reach', () => {
    expect(inCone(apex, 0, 40, 3, { x: 0, y: 0 })).toBe(false);
  });
});
