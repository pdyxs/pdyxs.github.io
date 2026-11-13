import { describe, it, expect } from 'vitest';
import { blank } from './game.ts';
import { addSet, addComponent, setComponentCount, addProperty, setComponentValue, addConcept, addEntity, addPer } from './ops.ts';
import { expand } from './expand.ts';

describe('expand', () => {
  it('gives count instances for a literal-count component, indexed from 0', () => {
    let g = addSet(blank(), { id: 's', name: 'Deck' });
    g = addComponent(g, { set: 's', id: 'k', name: 'Card' });
    g = setComponentCount(g, 'k', 3);
    const out = expand(g, 's');
    expect(out.map((i) => [i.component, i.index])).toEqual([['k', 0], ['k', 1], ['k', 2]]);
    expect(out[0].bound).toEqual({});
  });

  it('is empty for an unknown set', () => {
    expect(expand(blank(), 'nope')).toEqual([]);
  });
});

describe('expand: properties and values', () => {
  it('resolves the set properties per component, with defaults for unset ones', () => {
    let g = addSet(blank(), { id: 's', name: 'Deck' });
    g = addProperty(g, { owner: 's', id: 'cost', name: 'Cost', type: { kind: 'number', min: 2, max: 9 } });
    g = addProperty(g, { owner: 's', id: 'title', name: 'Title' });
    g = addComponent(g, { set: 's', id: 'a', name: 'Alpha' });
    g = addComponent(g, { set: 's', id: 'b', name: 'Beta' });
    g = setComponentValue(g, 'b', 'cost', 5);
    const out = expand(g, 's');
    expect(out.map((i) => i.values)).toEqual([{ cost: 2, title: '(Alpha)' }, { cost: 5, title: '(Beta)' }]);
  });
});

describe('expand: per-concepts', () => {
  function game() {
    let g = addConcept(blank(), { id: 'act', name: 'Action' });
    g = addEntity(g, { concept: 'act', id: 'a1', name: 'Run' });
    g = addEntity(g, { concept: 'act', id: 'a2', name: 'Hide' });
    g = addConcept(g, { id: 'pl', name: 'Player' });
    g = addEntity(g, { concept: 'pl', id: 'p1', name: 'Red' });
    g = addEntity(g, { concept: 'pl', id: 'p2', name: 'Blue' });
    g = addEntity(g, { concept: 'pl', id: 'p3', name: 'Green' });
    g = addSet(g, { id: 's', name: 'Deck' });
    g = addComponent(g, { set: 's', id: 'k', name: 'Action card' });
    g = setComponentCount(g, 'k', 2);
    g = addPer(g, 'k', 'act');
    g = addPer(g, 'k', 'pl');
    return g;
  }

  it('makes count x product of entity counts, each bound to its entities, in stable order', () => {
    const out = expand(game(), 's');
    expect(out).toHaveLength(2 * 2 * 3);
    expect(out.map((i) => i.index)).toEqual(Array.from({ length: 12 }, (_, i) => i));
    expect(out.slice(0, 3).map((i) => i.bound)).toEqual([{ act: 'a1', pl: 'p1' }, { act: 'a1', pl: 'p1' }, { act: 'a1', pl: 'p2' }]);
    expect(out[11].bound).toEqual({ act: 'a2', pl: 'p3' });
    expect(expand(game(), 's')).toEqual(out);
  });

  it('yields zero instances, not an error, when a per-concept has no entities', () => {
    let g = addConcept(blank(), { id: 'c', name: 'Empty' });
    g = addSet(g, { id: 's', name: 'S' });
    g = addComponent(g, { set: 's', id: 'k', name: 'K' });
    g = addPer(g, 'k', 'c');
    expect(expand(g, 's')).toEqual([]);
  });
});

describe('expand: nesting', () => {
  it('expands only the set own components; a nested set expands by its own id', () => {
    let g = addSet(blank(), { id: 'board', name: 'Board' });
    g = addSet(g, { id: 'sq', name: 'Squares', parent: 'board' });
    g = addComponent(g, { set: 'board', id: 'b', name: 'Board' });
    g = addComponent(g, { set: 'sq', id: 'q', name: 'Square' });
    g = setComponentCount(g, 'q', 4);
    expect(expand(g, 'board')).toHaveLength(1);
    expect(expand(g, 'sq')).toHaveLength(4);
  });
});
