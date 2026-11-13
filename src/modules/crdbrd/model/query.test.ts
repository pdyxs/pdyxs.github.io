import { describe, it, expect } from 'vitest';
import { blank } from './game.ts';
import { addConcept } from './ops.ts';
import { conceptPath } from './query.ts';

describe('conceptPath', () => {
  it('is the chain from a top-level concept down to the one asked for', () => {
    let g = addConcept(blank(), { id: 'a', name: 'A' });
    g = addConcept(g, { id: 'b', name: 'B', parent: 'a' });
    g = addConcept(g, { id: 'c', name: 'C', parent: 'b' });
    expect(conceptPath(g, 'c').map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(conceptPath(g, 'a').map((c) => c.id)).toEqual(['a']);
    expect(conceptPath(g, 'nope')).toEqual([]);
  });
});
