import { describe, it, expect } from 'vitest';
import { arcPath } from './wall-path';

describe('arcPath', () => {
  it('draws a half band as outer arc, end cap, inner arc back', () => {
    const d = arcPath({ shape: 'arc', mode: 'all', x: 0, y: 0, radius: 4, thickness: 1, start: 0, sweep: 180 });
    expect(d).toBe('M 4 0 A 4 4 0 0 1 -4 0 L -3 0 A 3 3 0 0 0 3 0 Z');
  });

  it('draws a full ring as two closed circles', () => {
    const d = arcPath({ shape: 'arc', mode: 'all', x: 1, y: 1, radius: 4, thickness: 1 });
    expect(d).toBe('M 5 1 A 4 4 0 1 1 -3 1 A 4 4 0 1 1 5 1 Z M 4 1 A 3 3 0 1 0 -2 1 A 3 3 0 1 0 4 1 Z');
  });
});
