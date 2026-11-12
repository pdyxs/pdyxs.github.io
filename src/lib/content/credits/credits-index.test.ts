import { describe, it, expect } from 'vitest';
import { computeCreditsIndex } from './credits-index';
import type { Credit } from './credits';

const credit = (over: Partial<Credit> & { name: string }): Credit => ({ listed: 'map', ...over });

describe('computeCreditsIndex', () => {
  it('lists each card a person is map-credited on, keyed by identity, with their roles there', () => {
    const idx = computeCreditsIndex([
      { uid: 'games/a', title: 'A', credits: [credit({ name: 'Tom', person: 'tom', role: 'Art' }), credit({ name: 'Tom', person: 'tom', role: 'Concept' })] },
      { uid: 'games/b', title: 'B', credits: [credit({ name: 'Tom D', person: 'tom', role: 'Code' })] },
    ]);
    expect(idx.get('person:tom')).toEqual([
      { uid: 'games/a', title: 'A', roles: ['Art', 'Concept'] },
      { uid: 'games/b', title: 'B', roles: ['Code'] },
    ]);
  });

  it('identifies by exact name when there is no person slug, and never merges the two', () => {
    const idx = computeCreditsIndex([
      { uid: 'x/a', title: 'A', credits: [credit({ name: 'Paul Swe', role: 'Art' }), credit({ name: 'Paul Sztajer', person: 'me', role: 'Code' })] },
    ]);
    expect([...idx.keys()].sort()).toEqual(['name:Paul Swe', 'person:me']);
  });

  it('counts listing-only credits for nothing', () => {
    const idx = computeCreditsIndex([
      { uid: 'x/a', title: 'A', credits: [credit({ name: 'Jim', listed: 'listing', role: 'Thanks' })] },
    ]);
    expect(idx.has('name:Jim')).toBe(false);
  });

  it('carries the group when they have no role, repeats no role, and skips cards without credits', () => {
    const idx = computeCreditsIndex([
      { uid: 'x/a', title: 'A' },
      { uid: 'x/b', title: 'B', credits: [credit({ name: 'Vo', group: 'Voice cast' }), credit({ name: 'Ed', role: 'Art' }), credit({ name: 'Ed', role: 'Art' })] },
    ]);
    expect(idx.get('name:Vo')).toEqual([{ uid: 'x/b', title: 'B', roles: [], group: 'Voice cast' }]);
    expect(idx.get('name:Ed')).toEqual([{ uid: 'x/b', title: 'B', roles: ['Art'] }]);
  });
});
