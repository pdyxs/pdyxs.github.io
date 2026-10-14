import { describe, it, expect } from 'vitest';
import { wallPieces, wallResponse } from './walls';
import { ARC_PIECE_DEGREES } from '../constants';

describe('wallResponse', () => {
  it('all blocks every charge', () => {
    for (const q of [-3, -1, 0, 2, 3]) expect(wallResponse('all', q)).toBe('block');
  });
  it('positive blocks positive charge only', () => {
    expect(wallResponse('positive', 2)).toBe('block');
    expect(wallResponse('positive', -1)).toBe('pass');
    expect(wallResponse('positive', 0)).toBe('pass');
  });
  it('negative blocks negative charge only', () => {
    expect(wallResponse('negative', -3)).toBe('block');
    expect(wallResponse('negative', 3)).toBe('pass');
    expect(wallResponse('negative', 0)).toBe('pass');
  });
  it('destroy destroys every charge', () => {
    for (const q of [-3, 0, 3]) expect(wallResponse('destroy', q)).toBe('destroy');
  });
});

describe('wallPieces', () => {
  it('a rect is one box, angle in radians', () => {
    expect(wallPieces({ shape: 'rect', mode: 'all', x: 1, y: 2, width: 4, height: 2, angle: 90 })).toEqual([
      { cx: 1, cy: 2, hw: 2, hh: 1, angle: Math.PI / 2 },
    ]);
  });

  it('an arc is several boxes laid along it, one per ARC_PIECE_DEGREES', () => {
    const half = wallPieces({ shape: 'arc', mode: 'all', x: 0, y: 0, radius: 5, thickness: 1, start: 0, sweep: 180 });
    expect(half).toHaveLength(180 / ARC_PIECE_DEGREES);
    const ring = wallPieces({ shape: 'arc', mode: 'all', x: 2, y: 3, radius: 5, thickness: 1 });
    expect(ring).toHaveLength(360 / ARC_PIECE_DEGREES);
    // Every piece sits on the band's mid-radius around the centre.
    for (const p of ring) expect(Math.hypot(p.cx - 2, p.cy - 3)).toBeCloseTo(4.5, 6);
  });

  it('rounds the piece count up so a short sweep still gets a piece', () => {
    expect(wallPieces({ shape: 'arc', mode: 'all', x: 0, y: 0, radius: 5, thickness: 1, sweep: 1 })).toHaveLength(1);
  });
});
