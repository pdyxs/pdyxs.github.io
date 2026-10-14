import { describe, it, expect } from 'vitest';
import { glyphFor } from './glyph';
import { PARTICLE_TYPES } from '../../../lib/particulars/scenario/types';

describe('glyphFor', () => {
  it('draws each of the 12 types as a distinct shape', () => {
    const shapes = PARTICLE_TYPES.map((t) => {
      const g = glyphFor(t);
      return g.kind === 'circle' ? 'circle' : g.points(1);
    });
    expect(PARTICLE_TYPES).toHaveLength(12);
    expect(new Set(shapes).size).toBe(12);
  });

  it('gives polygons and stars as an SVG points string scaled to the radius', () => {
    const g = glyphFor('up');
    expect(g.kind).toBe('polygon');
    if (g.kind !== 'polygon') return;
    const pts = g.points(2).split(' ').map((p) => p.split(',').map(Number));
    expect(pts).toHaveLength(3);
    for (const [x, y] of pts) expect(Math.hypot(x, y)).toBeCloseTo(2, 3);
  });
});
