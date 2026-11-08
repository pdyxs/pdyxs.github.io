import { describe, it, expect } from 'vitest';
import { buildCreditsViews } from './credits-view';
import type { Credit } from './credits';

const credit = (over: Partial<Credit> & { name: string }): Credit => ({ listed: 'map', ...over });

const cards = [
  { uid: 'games/a', credits: [credit({ name: 'Nick', role: 'Design' }), credit({ name: 'Paul', person: 'me', role: 'Code' })] },
  { uid: 'games/none' },
  { uid: 'games/thanks-only', credits: [credit({ name: 'Academy', listed: 'listing' })] },
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

  it('is deterministic: two builds give the same views', () => {
    expect(JSON.stringify([...buildCreditsViews(cards)])).toBe(JSON.stringify([...buildCreditsViews(cards)]));
  });
});
