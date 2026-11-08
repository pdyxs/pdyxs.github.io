import { describe, it, expect } from 'vitest';
import { computeCreditsIndex } from './credits-index';
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

  it("names the centre node after the card, falling back to 'This card'", () => {
    const one = [credit({ name: 'Nick', role: 'Designer' })];
    const centre = (g: ReturnType<typeof buildCreditsGraph>) => g.nodes.find(n => n.kind === 'card')!.label;
    expect(centre(buildCreditsGraph(one, { uid: 'g/u', index: computeCreditsIndex([]), title: 'Unstoppabot' }))).toBe('Unstoppabot');
    expect(centre(buildCreditsGraph(one))).toBe('This card');
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

describe('buildCreditsGraph expansions', () => {
  const index = computeCreditsIndex([
    { uid: 'g/here', title: 'Here', credits: [credit({ name: 'Tom', person: 'tom', role: 'Art' }), credit({ name: 'Solo', role: 'Art' }), credit({ name: 'Jim', role: 'Art' }), credit({ name: 'Vo', group: 'Cast' })] },
    { uid: 'g/there', title: 'There', credits: [credit({ name: 'Tom', person: 'tom', role: 'Code' }), credit({ name: 'Tom', person: 'tom', role: 'Concept' }), credit({ name: 'Jim', listed: 'listing', role: 'Thanks' }), credit({ name: 'Vo', group: 'Chorus' })] },
  ]);
  const here = [credit({ name: 'Tom', person: 'tom', role: 'Art' }), credit({ name: 'Solo', role: 'Art' }), credit({ name: 'Jim', role: 'Art' }), credit({ name: 'Vo', group: 'Cast' })];
  const g = buildCreditsGraph(here, { uid: 'g/here', index });

  it('offers a person their other cards, joined straight to them and labelled with their roles', () => {
    expect(Object.keys(g.expansions!).sort()).toEqual(['name:Vo', 'person:tom']);
    const ex = g.expansions!['person:tom'];
    expect(ex.nodes).toEqual([{ id: 'project:person:tom\u0000g/there', kind: 'project', label: 'There', uid: 'g/there' }]);
    expect(ex.edges).toEqual([{ from: 'person:tom', to: ex.nodes[0].id, label: 'Code, Concept' }]);
  });

  it('labels a role-less appearance with the group; never offers this card or a listing-only appearance', () => {
    expect(g.expansions!['name:Vo'].edges[0].label).toBe('Chorus');
    expect(g.expansions!['name:Jim']).toBeUndefined();
    expect(g.expansions!['name:Solo']).toBeUndefined();
  });

  it('has no expansions without an index', () => {
    expect(buildCreditsGraph(here).expansions).toBeUndefined();
  });
});
