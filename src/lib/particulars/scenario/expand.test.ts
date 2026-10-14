import { describe, it, expect } from 'vitest';
import { expand } from './expand';
import type { Formation } from './types';

const LIB: Record<string, Formation> = {};

describe('expand', () => {
  it('a built-in particle name is a single particle at the entry position, white and matter', () => {
    const specs = expand({ spawn: 'electron', position: { x: 2, y: 3 } }, LIB);
    expect(specs).toEqual([
      { particle: { type: 'electron', colour: 'white', parity: 1 }, x: 2, y: 3, vx: 0, vy: 0, telegraph: 0 },
    ]);
  });

  it('an explicit particle carries its colour and parity', () => {
    const [spec] = expand({ spawn: { type: 'up', colour: 'red', parity: -1 } }, LIB);
    expect(spec.particle).toEqual({ type: 'up', colour: 'red', parity: -1 });
  });

  it('a Single formation repeats its contents round-robin, all at its centre', () => {
    const lib: Record<string, Formation> = { pair: { kind: 'single', count: 3, contents: ['electron', { type: 'electron', parity: -1 }] } };
    const specs = expand({ spawn: 'pair', position: { x: 1, y: 1 } }, lib);
    expect(specs.map((s) => [s.particle.type, s.particle.parity, s.x, s.y])).toEqual([
      ['electron', 1, 1, 1],
      ['electron', -1, 1, 1],
      ['electron', 1, 1, 1],
    ]);
  });

  it('a Line spaces its particles by distance, centred on the entry position', () => {
    const lib: Record<string, Formation> = { row: { kind: 'line', count: 3, distance: 2, contents: ['up'] } };
    const specs = expand({ spawn: 'row', position: { x: 10, y: 5 } }, lib);
    expect(specs.map((s) => [s.x, s.y])).toEqual([[8, 5], [10, 5], [12, 5]]);
  });

  it('an entry angle rotates a Line about its centre (degrees, y down)', () => {
    const lib: Record<string, Formation> = { row: { kind: 'line', count: 3, distance: 2, contents: ['up'] } };
    const specs = expand({ spawn: 'row', angle: 90 }, lib);
    specs.forEach((s, i) => {
      expect(s.x).toBeCloseTo(0, 9);
      expect(s.y).toBeCloseTo((i - 1) * 2, 9);
    });
  });

  it('a Circle spreads its particles evenly round the radius, alternating its contents', () => {
    const lib: Record<string, Formation> = {
      ring: { kind: 'circle', count: 4, radius: 2, contents: ['electron', { type: 'electron', parity: -1 }] },
    };
    const specs = expand({ spawn: 'ring', position: { x: 1, y: 1 } }, lib);
    const r = (n: number) => Math.round(n * 1e6) / 1e6 + 0;
    const pts = specs.map((s) => [r(s.x - 1), r(s.y - 1)]);
    expect(pts).toEqual([[2, 0], [0, 2], [-2, 0], [0, -2]]);
    expect(specs.map((s) => s.particle.parity)).toEqual([1, -1, 1, -1]);
  });

  it('a partial arc puts the first and last particle at its two ends', () => {
    const lib: Record<string, Formation> = { fan: { kind: 'circle', count: 3, radius: 2, arc: 0.5, contents: ['up'] } };
    const specs = expand({ spawn: 'fan' }, lib);
    expect(specs[0].x).toBeCloseTo(2, 9);
    expect(specs[1].y).toBeCloseTo(2, 9);
    expect(specs[2].x).toBeCloseTo(-2, 9);
    expect(specs[2].y).toBeCloseTo(0, 9);
  });

  it('nested angles stack: a ring at 90 holding lines at 0 puts the lines at 90', () => {
    const lib: Record<string, Formation> = {
      ring: { kind: 'circle', count: 2, radius: 4, angle: 90, contents: ['spoke'] },
      spoke: { kind: 'line', count: 2, distance: 2, angle: 0, contents: ['up'] },
    };
    const pts = expand({ spawn: 'ring' }, lib).map((s) => [Math.round(s.x * 1e6) / 1e6 + 0, Math.round(s.y * 1e6) / 1e6 + 0]);
    // ring slots rotate to (0,4) and (0,-4); each line now runs along y, not x
    expect(pts).toEqual([[0, 3], [0, 5], [0, -5], [0, -3]]);
  });

  it('angles add at every level: entry 10 + ring 20 + line 30 lies along 60 degrees', () => {
    const lib: Record<string, Formation> = {
      ring: { kind: 'circle', count: 1, radius: 0, angle: 20, contents: ['row'] },
      row: { kind: 'line', count: 2, distance: 2, angle: 30, contents: ['up'] },
    };
    const [a, b] = expand({ spawn: 'ring', angle: 10 }, lib);
    expect(Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI)).toBeCloseTo(60, 6);
  });

  it('velocity is one absolute vector for every particle, magnitude/angle or x/y', () => {
    const lib: Record<string, Formation> = { ring: { kind: 'circle', count: 3, radius: 1, angle: 45, contents: ['up'] } };
    const polar = expand({ spawn: 'ring', angle: 33, velocity: { magnitude: 2, angle: 90 } }, lib);
    for (const s of polar) {
      expect(s.vx).toBeCloseTo(0, 9);
      expect(s.vy).toBeCloseTo(2, 9);
    }
    const cart = expand({ spawn: 'electron', velocity: { x: -1, y: 4 } }, lib);
    expect([cart[0].vx, cart[0].vy]).toEqual([-1, 4]);
  });

  it('every particle carries the entry telegraph duration', () => {
    const lib: Record<string, Formation> = { row: { kind: 'line', count: 2, distance: 1, contents: ['up'] } };
    expect(expand({ spawn: 'row', telegraph: 1.5 }, lib).map((s) => s.telegraph)).toEqual([1.5, 1.5]);
  });
});
