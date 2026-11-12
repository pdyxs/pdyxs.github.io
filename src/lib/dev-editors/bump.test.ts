import { describe, it, expect } from 'vitest';
import { bump } from './bump.ts';

describe('bump', () => {
  it.each([
    ['1.2.3', 'major', '2.0.0'],
    ['1.2.3', 'minor', '1.3.0'],
    ['1.2.3', 'patch', '1.2.4'],
    ['0.0.9', 'patch', '0.0.10'],
  ] as const)('%s %s -> %s, resetting lower parts', (v, kind, next) => {
    expect(bump(v, kind)).toBe(next);
  });

  it('drops prerelease and build suffixes', () => {
    expect(bump('1.2.3-beta.1+x', 'patch')).toBe('1.2.4');
  });

  it('throws on a non-semver version', () => {
    expect(() => bump('nope', 'minor')).toThrow();
  });
});
