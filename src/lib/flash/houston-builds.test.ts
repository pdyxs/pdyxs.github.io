import { describe, it, expect } from 'vitest';
import { HOUSTON_BUILDS } from './houston-builds';

describe('HOUSTON_BUILDS', () => {
  it('lists the three builds, each labelled with a name and a date, at 1024x768', () => {
    expect(HOUSTON_BUILDS.map((b) => b.name)).toEqual(['Prototype 1', 'Prototype 2', 'Mobile (AIR iOS port)']);
    for (const b of HOUSTON_BUILDS) {
      expect(b.date).toMatch(/^[A-Z][a-z]+ 2015$|^2015$/);
      expect([b.width, b.height]).toEqual([1024, 768]);
    }
  });

  it('serves every SWF from the gitignored experiments folder', () => {
    for (const b of HOUSTON_BUILDS) expect(b.swfUrl).toMatch(/^\/experiments\/houston\/[\w-]+\/[\w]+\.swf$/);
  });
});
