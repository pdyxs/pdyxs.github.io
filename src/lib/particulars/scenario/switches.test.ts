import { describe, it, expect } from 'vitest';
import { resolveSwitches } from './switches';

describe('resolveSwitches', () => {
  it('turns every omitted force off', () => {
    expect(resolveSwitches(undefined)).toEqual({ strong: false, weak: false, em: false, gravity: false });
    expect(resolveSwitches({ em: true })).toEqual({ strong: false, weak: false, em: true, gravity: false });
  });
});
