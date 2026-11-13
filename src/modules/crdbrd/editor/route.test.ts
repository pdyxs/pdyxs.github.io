import { describe, it, expect } from 'vitest';
import { parseRoute, routeHash } from './route.ts';

describe('hash route', () => {
  it('parses the three pages', () => {
    expect(parseRoute('')).toEqual({ page: 'game' });
    expect(parseRoute('#/')).toEqual({ page: 'game' });
    expect(parseRoute('#/concepts/c1')).toEqual({ page: 'concept', concept: 'c1' });
    expect(parseRoute('#/concepts/c1/entities/e1')).toEqual({ page: 'entity', concept: 'c1', entity: 'e1' });
  });

  it('falls back to the game page on anything unrecognised', () => {
    expect(parseRoute('#/nope')).toEqual({ page: 'game' });
    expect(parseRoute('#/concepts')).toEqual({ page: 'game' });
    expect(parseRoute('#/concepts/c1/entities')).toEqual({ page: 'game' });
    expect(parseRoute('#/concepts/%E0%A4')).toEqual({ page: 'game' });
  });

  it('writes a hash that parses back', () => {
    expect(routeHash({ page: 'game' })).toBe('#/');
    expect(routeHash({ page: 'concept', concept: 'c1' })).toBe('#/concepts/c1');
    expect(routeHash({ page: 'entity', concept: 'c1', entity: 'e1' })).toBe('#/concepts/c1/entities/e1');
    for (const r of [{ page: 'concept', concept: 'a/b c' }, { page: 'entity', concept: 'x', entity: 'y z' }] as const) {
      expect(parseRoute(routeHash(r))).toEqual(r);
    }
  });
});
