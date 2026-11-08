import { describe, it, expect } from 'vitest';
import { buildCreditsGraph } from './credits-graph';
import type { Credit } from './credits';

const credit = (over: Partial<Credit> & { name: string }): Credit => ({ listed: 'map', ...over });

describe('buildCreditsGraph', () => {
  it('hangs a person off their role, and the role off the card', () => {
    const g = buildCreditsGraph([credit({ name: 'Nick', person: 'nick', role: 'Designer' })]);
    const byKind = (k: string) => g.nodes.filter(n => n.kind === k).map(n => n.label);
    expect(byKind('card')).toHaveLength(1);
    expect(byKind('role')).toEqual(['Designer']);
    expect(byKind('person')).toEqual(['Nick']);
    const id = (k: string) => g.nodes.find(n => n.kind === k)!.id;
    expect(g.edges).toEqual([
      { from: id('card'), to: id('role') },
      { from: id('role'), to: id('person') },
    ]);
  });

  const shape = (g: ReturnType<typeof buildCreditsGraph>) => {
    const label = (id: string) => g.nodes.find(n => n.id === id)!.kind === 'card' ? 'CARD' : g.nodes.find(n => n.id === id)!.label;
    return g.edges.map(e => `${label(e.from)}>${label(e.to)}`);
  };

  it('puts a group between card and role, and skips the tier when there is none', () => {
    const g = buildCreditsGraph([
      credit({ name: 'A', group: 'Art', role: 'Painter' }),
      credit({ name: 'B', role: 'Writer' }),
    ]);
    expect(shape(g)).toEqual(['CARD>Art', 'Art>Painter', 'Painter>A', 'CARD>Writer', 'Writer>B']);
  });

  it('hangs a role-less person off the group, or off the card with neither', () => {
    const g = buildCreditsGraph([credit({ name: 'A', group: 'Art' }), credit({ name: 'B' })]);
    expect(shape(g)).toEqual(['CARD>Art', 'Art>A', 'CARD>B']);
  });

  it('makes one person node per identity, joined to each role they hold', () => {
    const g = buildCreditsGraph([
      credit({ name: 'Nick', person: 'nick', role: 'Design' }),
      credit({ name: 'Nick K', person: 'nick', role: 'Code' }),
      credit({ name: 'Nick', role: 'Other' }),
    ]);
    const people = g.nodes.filter(n => n.kind === 'person');
    expect(people.map(p => p.label)).toEqual(['Nick', 'Nick']);
    expect(g.edges.filter(e => e.to === people[0].id)).toHaveLength(2);
    expect(g.edges.filter(e => e.to === people[1].id)).toHaveLength(1);
  });

  it('keeps groups and roles per card-local: the same role under two groups is two nodes', () => {
    const g = buildCreditsGraph([
      credit({ name: 'A', group: 'X', role: 'Art' }),
      credit({ name: 'B', group: 'Y', role: 'Art' }),
    ]);
    expect(g.nodes.filter(n => n.kind === 'role')).toHaveLength(2);
  });

  it('leaves out listing-only credits', () => {
    const g = buildCreditsGraph([credit({ name: 'A', role: 'R' }), credit({ name: 'Thanks', role: 'R', listed: 'listing' })]);
    expect(g.nodes.map(n => n.label)).not.toContain('Thanks');
  });

  it('has no duplicate edges', () => {
    const g = buildCreditsGraph([credit({ name: 'A', role: 'R' }), credit({ name: 'A', role: 'R' })]);
    expect(g.edges).toHaveLength(2);
  });
});
