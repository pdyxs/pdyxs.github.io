import { describe, it, expect } from 'vitest';
import { validate } from './validate';

const GOOD = { walls: { width: 20, height: 10 }, player: { x: 0, y: 0, radius: 0.5 } };

describe('validate', () => {
  it('accepts a minimal scenario and returns it typed', () => {
    const result = validate(GOOD);
    expect(result).toEqual({ ok: true, scenario: GOOD });
  });
});

describe('validate errors', () => {
  it('names the path of each problem readably', () => {
    const result = validate({ walls: { width: -1, height: 'tall' }, player: { x: 0, y: 0 } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      'walls.width must be a positive number',
      'walls.height must be a positive number',
      'player.radius must be a positive number',
    ]);
  });

  it('rejects a non-object and missing sections', () => {
    expect(validate(null)).toEqual({ ok: false, errors: ['scenario must be an object'] });
    const result = validate({});
    expect(result).toEqual({ ok: false, errors: ['walls must be an object', 'player must be an object'] });
  });

  it('rejects a player that does not fit inside the walls', () => {
    const result = validate({ walls: { width: 4, height: 4 }, player: { x: 1.8, y: 0, radius: 0.5 } });
    expect(result).toEqual({ ok: false, errors: ['player must lie fully inside the walls'] });
  });
});
