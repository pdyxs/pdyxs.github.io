import { describe, it, expect } from 'vitest';
import { buildCreditsViews } from './credits-view';
import type { Credit } from './credits';

const credit = (over: Partial<Credit> & { name: string }): Credit => ({ listed: 'map', ...over });

const cards = [
  { uid: 'games/a', title: 'A', credits: [credit({ name: 'Nick', role: 'Design' }), credit({ name: 'Paul', person: 'me', role: 'Code' })] },
  { uid: 'games/none', title: 'None' },
  { uid: 'games/thanks-only', title: 'T', credits: [credit({ name: 'Academy', listed: 'listing' })] },
];

describe('buildCreditsViews', () => {
  it('has a view for each card that has something to open, and none for the rest', () => {
    expect([...buildCreditsViews(cards).keys()]).toEqual(['games/a']);
  });

  it('carries the line, the listing and a positioned graph', () => {
    const view = buildCreditsViews(cards).get('games/a')!;
    expect(view.line).toEqual({ names: ['Nick', 'Paul'] });
    expect(view.listing).toHaveLength(1);
    expect(view.graph.nodes.map(n => n.kind)).toEqual(['card', 'role', 'person', 'role', 'person']);
    expect(view.graph.nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
  });

  it('ships each person\'s other projects, laid out, in graph.expansions', () => {
    const two = [
      { uid: 'games/a', title: 'A', credits: [credit({ name: 'Paul', person: 'me', role: 'Code' }), credit({ name: 'Nick', role: 'Design' })] },
      { uid: 'games/b', title: 'B', credits: [credit({ name: 'Paul', person: 'me', role: 'Art' })] },
    ];
    const ex = buildCreditsViews(two).get('games/a')!.graph.expansions!;
    expect(Object.keys(ex)).toEqual(['person:me']);
    expect(ex['person:me'].nodes).toMatchObject([{ kind: 'project', uid: 'games/b', label: 'B' }]);
    expect(Number.isFinite(ex['person:me'].nodes[0].x)).toBe(true);
    expect(ex['person:me'].edges[0].label).toBe('Art');
  });

  it('is deterministic: two builds give the same views', () => {
    expect(JSON.stringify([...buildCreditsViews(cards)])).toBe(JSON.stringify([...buildCreditsViews(cards)]));
  });
});
