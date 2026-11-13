import { describe, it, expect } from 'vitest';
import { blank } from './game.ts';
import { addConcept, renameConcept, removeConcept, addProperty, renameProperty, setPropertyType, removeProperty, addEntity, renameEntity, removeEntity, setEntityValue, setGameValue, renameGame, addSet, renameSet, removeSet, setSubstitute, addComponent, renameComponent, removeComponent, setComponentCount, addPer, removePer, setComponentValue } from './ops.ts';
import { findConcept, valueOf, findSet, findComponent, setPath } from './query.ts';
import type { Game } from './types.ts';

describe('concept ops', () => {
  it('adds a concept and returns a new game without mutating the old', () => {
    const g0 = blank();
    const g1 = addConcept(g0, { id: 'c1', name: 'Players' });
    expect(g0.concepts).toEqual([]);
    expect(g1.concepts).toEqual([{ id: 'c1', name: 'Players', count: 1, properties: [], entities: [], children: [] }]);
  });

  it('renames a concept by id, wherever it nests', () => {
    let g = addConcept(blank(), { id: 'a', name: 'A' });
    g = addConcept(g, { id: 'b', name: 'B', parent: 'a' });
    g = renameConcept(g, 'b', 'Bee');
    expect(findConcept(g, 'b')?.name).toBe('Bee');
    expect(findConcept(g, 'a')?.name).toBe('A');
  });

  it('removes a concept', () => {
    let g = addConcept(blank(), { id: 'a', name: 'A' });
    g = addConcept(g, { id: 'b', name: 'B' });
    g = removeConcept(g, 'a');
    expect(g.concepts.map((c) => c.id)).toEqual(['b']);
  });
});

describe('property ops', () => {
  const base = () => addConcept(blank(), { id: 'c', name: 'Cards' });

  it('adds a property to a concept, text by default', () => {
    const g = addProperty(base(), { owner: 'c', id: 'p', name: 'Title' });
    expect(findConcept(g, 'c')?.properties).toEqual([{ id: 'p', name: 'Title', type: { kind: 'text' } }]);
  });

  it('adds a game-level property when there is no owner', () => {
    const g = addProperty(base(), { id: 'p', name: 'Theme', type: { kind: 'colour' } });
    expect(g.properties).toEqual([{ id: 'p', name: 'Theme', type: { kind: 'colour' } }]);
  });

  it('renames and retypes a property', () => {
    let g = addProperty(base(), { owner: 'c', id: 'p', name: 'Cost' });
    g = renameProperty(g, 'p', 'Price');
    g = setPropertyType(g, 'p', { kind: 'number', min: 0, max: 9 });
    expect(findConcept(g, 'c')?.properties[0]).toEqual({ id: 'p', name: 'Price', type: { kind: 'number', min: 0, max: 9 } });
  });

  it('removes a property', () => {
    let g = addProperty(base(), { owner: 'c', id: 'p', name: 'Cost' });
    g = removeProperty(g, 'p');
    expect(findConcept(g, 'c')?.properties).toEqual([]);
  });

  it('removing a concept strips reference properties that pointed at it', () => {
    let g = addConcept(base(), { id: 'd', name: 'Decks' });
    g = addProperty(g, { owner: 'c', id: 'ref', name: 'Deck', type: { kind: 'reference', concept: 'd' } });
    g = addProperty(g, { owner: 'c', id: 'keep', name: 'Title' });
    g = addProperty(g, { id: 'gref', name: 'Main deck', type: { kind: 'reference', concept: 'd' } });
    g = removeConcept(g, 'd');
    expect(findConcept(g, 'c')?.properties.map((p) => p.id)).toEqual(['keep']);
    expect(g.properties).toEqual([]);
  });

  it('removing a concept strips references to its nested concepts too', () => {
    let g = addConcept(base(), { id: 'd', name: 'Decks' });
    g = addConcept(g, { id: 'dd', name: 'Sub', parent: 'd' });
    g = addProperty(g, { owner: 'c', id: 'ref', name: 'Sub', type: { kind: 'reference', concept: 'dd' } });
    g = removeConcept(g, 'd');
    expect(findConcept(g, 'c')?.properties).toEqual([]);
  });
});

describe('entity ops', () => {
  const withProps = () => {
    let g = addConcept(blank(), { id: 'c', name: 'Players' });
    g = addProperty(g, { owner: 'c', id: 'score', name: 'Score', type: { kind: 'number', min: 2, max: 9 } });
    g = addProperty(g, { owner: 'c', id: 'label', name: 'Label' });
    return g;
  };
  const entity = (g: Game, id: string) => findConcept(g, 'c')!.entities.find((e) => e.id === id);

  it('adds, renames and removes entities', () => {
    let g = addEntity(withProps(), { concept: 'c', id: 'e1', name: 'Red' });
    expect(entity(g, 'e1')).toEqual({ id: 'e1', name: 'Red', values: {} });
    g = renameEntity(g, 'e1', 'Blue');
    expect(entity(g, 'e1')?.name).toBe('Blue');
    g = removeEntity(g, 'e1');
    expect(findConcept(g, 'c')!.entities).toEqual([]);
  });

  it('sets an entity value without touching the old game', () => {
    const g0 = addEntity(withProps(), { concept: 'c', id: 'e1', name: 'Red' });
    const g1 = setEntityValue(g0, 'e1', 'score', 5);
    expect(entity(g1, 'e1')?.values).toEqual({ score: 5 });
    expect(entity(g0, 'e1')?.values).toEqual({});
  });

  it('sets a game-level value', () => {
    let g = addProperty(blank(), { id: 'p', name: 'On', type: { kind: 'boolean' } });
    g = setGameValue(g, 'p', true);
    expect(g.values).toEqual({ p: true });
  });

  it('retyping a property drops the values that no longer fit', () => {
    let g = addEntity(withProps(), { concept: 'c', id: 'e1', name: 'Red' });
    g = setEntityValue(g, 'e1', 'score', 5);
    g = setEntityValue(g, 'e1', 'label', 'hi');
    g = setPropertyType(g, 'score', { kind: 'boolean' });
    expect(entity(g, 'e1')?.values).toEqual({ label: 'hi' });
  });

  it('removing a property drops its values', () => {
    let g = addEntity(withProps(), { concept: 'c', id: 'e1', name: 'Red' });
    g = setEntityValue(g, 'e1', 'score', 5);
    g = removeProperty(g, 'score');
    expect(entity(g, 'e1')?.values).toEqual({});
  });

  it('removing a concept removes its entities and values that referenced a removed concept', () => {
    let g = addConcept(withProps(), { id: 'd', name: 'Decks' });
    g = addEntity(g, { concept: 'd', id: 'd1', name: 'Main' });
    g = addProperty(g, { owner: 'c', id: 'deck', name: 'Deck', type: { kind: 'reference', concept: 'd' } });
    g = addEntity(g, { concept: 'c', id: 'e1', name: 'Red' });
    g = setEntityValue(g, 'e1', 'deck', 'd1');
    g = removeConcept(g, 'd');
    expect(entity(g, 'e1')?.values).toEqual({});
    expect(findConcept(g, 'd')).toBeUndefined();
  });

  it('removing an entity clears references to it', () => {
    let g = addConcept(withProps(), { id: 'd', name: 'Decks' });
    g = addEntity(g, { concept: 'd', id: 'd1', name: 'Main' });
    g = addProperty(g, { owner: 'c', id: 'deck', name: 'Deck', type: { kind: 'reference', concept: 'd' } });
    g = addEntity(g, { concept: 'c', id: 'e1', name: 'Red' });
    g = setEntityValue(g, 'e1', 'deck', 'd1');
    g = removeEntity(g, 'd1');
    expect(entity(g, 'e1')?.values).toEqual({});
  });
});

describe('defaults', () => {
  const e = { id: 'e', name: 'Red', values: {} };
  it('falls back to the type default for a missing value', () => {
    expect(valueOf(e, { id: 'a', name: 'A', type: { kind: 'number', min: 3, max: 9 } })).toBe(3);
    expect(valueOf(e, { id: 'a', name: 'A', type: { kind: 'text' } })).toBe('(Red)');
    expect(valueOf(e, { id: 'a', name: 'A', type: { kind: 'colour' } })).toBe('#000000');
    expect(valueOf(e, { id: 'a', name: 'A', type: { kind: 'boolean' } })).toBe(false);
    expect(valueOf(e, { id: 'a', name: 'A', type: { kind: 'reference', concept: 'x' } })).toBeNull();
  });
  it('prefers a stored value', () => {
    expect(valueOf({ ...e, values: { a: 7 } }, { id: 'a', name: 'A', type: { kind: 'number', min: 3, max: 9 } })).toBe(7);
  });
});

describe('nesting', () => {
  it('removing a concept removes its nested concepts and their entities', () => {
    let g = addConcept(blank(), { id: 'a', name: 'A' });
    g = addConcept(g, { id: 'b', name: 'B', parent: 'a' });
    g = addConcept(g, { id: 'c', name: 'C', parent: 'b' });
    g = addEntity(g, { concept: 'c', id: 'e', name: 'E' });
    expect(findConcept(g, 'c')?.entities).toHaveLength(1);
    g = removeConcept(g, 'b');
    expect(findConcept(g, 'a')?.children).toEqual([]);
    expect(findConcept(g, 'c')).toBeUndefined();
  });
});

it('renames the game', () => {
  expect(renameGame(blank(), 'Chess').name).toBe('Chess');
});

describe('set and component ops', () => {
  const withSet = () => addSet(blank(), { id: 's', name: 'Deck' });

  it('adds, nests, renames and removes sets without mutating', () => {
    const g0 = blank();
    let g = addSet(g0, { id: 's', name: 'Deck' });
    expect(g0.sets).toEqual([]);
    expect(g.sets![0]).toEqual({ id: 's', name: 'Deck', substitute: '', properties: [], components: [], children: [] });
    g = addSet(g, { id: 't', name: 'Halves', parent: 's' });
    g = renameSet(g, 't', 'Card halves');
    expect(findSet(g, 't')?.name).toBe('Card halves');
    expect(setPath(g, 't').map((s) => s.id)).toEqual(['s', 't']);
    g = removeSet(g, 's');
    expect(g.sets).toEqual([]);
  });

  it('works on games saved before sets existed', () => {
    const { sets, ...old } = blank();
    expect(addSet(old, { id: 's', name: 'Deck' }).sets).toHaveLength(1);
    expect(removeConcept(old, 'x')).toEqual(old);
  });

  it('stores the substitute description', () => {
    const g = setSubstitute(withSet(), 's', 'a wooden cube');
    expect(findSet(g, 's')?.substitute).toBe('a wooden cube');
  });

  it('adds, edits and removes components', () => {
    let g = addComponent(withSet(), { set: 's', id: 'k', name: 'Card' });
    expect(findComponent(g, 'k')).toEqual({ id: 'k', name: 'Card', count: 1, per: [], values: {} });
    g = setComponentCount(g, 'k', 4.7);
    expect(findComponent(g, 'k')?.count).toBe(4);
    g = setComponentCount(g, 'k', -3);
    expect(findComponent(g, 'k')?.count).toBe(0);
    g = renameComponent(g, 'k', 'Big card');
    expect(findComponent(g, 'k')?.name).toBe('Big card');
    g = removeComponent(g, 'k');
    expect(findSet(g, 's')?.components).toEqual([]);
  });

  it('adds set properties and component values; retyping drops values; removing drops them too', () => {
    let g = addComponent(withSet(), { set: 's', id: 'k', name: 'Card' });
    g = addProperty(g, { owner: 's', id: 'p', name: 'Cost', type: { kind: 'number', min: 0, max: 9 } });
    g = setComponentValue(g, 'k', 'p', 3);
    expect(findComponent(g, 'k')?.values).toEqual({ p: 3 });
    expect(findSet(g, 's')?.properties).toHaveLength(1);
    g = renameProperty(g, 'p', 'Price');
    expect(findSet(g, 's')?.properties[0].name).toBe('Price');
    expect(findComponent(setPropertyType(g, 'p', { kind: 'text' }), 'k')?.values).toEqual({});
    g = removeProperty(g, 'p');
    expect(findSet(g, 's')?.properties).toEqual([]);
    expect(findComponent(g, 'k')?.values).toEqual({});
  });

  it('adds a per-concept once and removes it', () => {
    let g = addComponent(addConcept(withSet(), { id: 'c', name: 'Player' }), { set: 's', id: 'k', name: 'Card' });
    g = addPer(addPer(g, 'k', 'c'), 'k', 'c');
    expect(findComponent(g, 'k')?.per).toEqual(['c']);
    expect(findComponent(removePer(g, 'k', 'c'), 'k')?.per).toEqual([]);
  });

  it('removing a concept removes it, nested ones too, from every per-list', () => {
    let g = addConcept(withSet(), { id: 'c', name: 'Player' });
    g = addConcept(g, { id: 'd', name: 'Colour', parent: 'c' });
    g = addConcept(g, { id: 'e', name: 'Other' });
    g = addComponent(g, { set: 's', id: 'k', name: 'Card' });
    for (const id of ['c', 'd', 'e']) g = addPer(g, 'k', id);
    expect(findComponent(removeConcept(g, 'c'), 'k')?.per).toEqual(['e']);
  });

  it('removing an entity clears component references to it; removing a concept strips set reference properties', () => {
    let g = addConcept(withSet(), { id: 'c', name: 'Player' });
    g = addEntity(g, { concept: 'c', id: 'e', name: 'Red' });
    g = addProperty(g, { owner: 's', id: 'r', name: 'Owner', type: { kind: 'reference', concept: 'c' } });
    g = addComponent(g, { set: 's', id: 'k', name: 'Card' });
    g = setComponentValue(g, 'k', 'r', 'e');
    expect(findComponent(removeEntity(g, 'e'), 'k')?.values).toEqual({});
    const gone = removeConcept(g, 'c');
    expect(findSet(gone, 's')?.properties).toEqual([]);
    expect(findComponent(gone, 'k')?.values).toEqual({});
  });
});
