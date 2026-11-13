import { describe, it, expect } from 'vitest';
import { validPathData } from './path.ts';

describe('validPathData', () => {
  it('accepts well-formed path data, with relative commands, implicit repeats and arcs', () => {
    for (const d of ['M0 0L10 0L5 8Z', 'm0,0 l10,0 5,8 z', 'M0 0H10V10H0Z', 'M0 0C1 1 2 2 3 3S4 4 5 5Q1 1 2 2T3 3', 'M0 5A5 5 0 1 1 10 5A5 5 0 1 1 0 5Z', 'M-1.5 .5L2e1 3']) expect(validPathData(d), d).toBe(true);
  });

  it('rejects empty paths, ones not starting with a move, unknown commands, wrong argument counts and stray text', () => {
    for (const d of ['', '   ', 'L1 1', 'M0 0X1 1', 'M0', 'M0 0L1', 'M0 0 hello', 'M0 0A5 5 0 2 1 1 1', 'M0 0Z1']) expect(validPathData(d), d).toBe(false);
  });
});
