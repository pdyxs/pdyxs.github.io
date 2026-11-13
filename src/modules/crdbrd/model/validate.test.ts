import { describe, it, expect } from 'vitest';
import { blank } from './game.ts';
import { validate } from './validate.ts';
import type { Game } from './types.ts';
import { addConcept, addEntity, addProperty, setEntityValue, addSet, addComponent, addPer, setComponentValue, addLayer } from './ops.ts';

describe('validate', () => {
  it('accepts a blank game and an edited one', () => {
    expect(validate(blank())).toEqual([]);
    let g = addConcept(blank(), { id: 'c', name: 'Players' });
    g = addProperty(g, { owner: 'c', id: 'p', name: 'Score', type: { kind: 'number', min: 0, max: 9 } });
    g = addEntity(g, { concept: 'c', id: 'e', name: 'Red' });
    g = setEntityValue(g, 'e', 'p', 4);
    expect(validate(g)).toEqual([]);
  });

  it('rejects non-objects and malformed shapes', () => {
    expect(validate(null)).toEqual(['game must be an object']);
    expect(validate({ name: 1, properties: {}, values: [], concepts: 'x' })).toEqual([
      'name must be a string', 'properties must be an array', 'values must be an object', 'concepts must be an array',
    ]);
  });

  it('rejects duplicate ids', () => {
    let g = addConcept(blank(), { id: 'c', name: 'A' });
    g = addConcept(g, { id: 'c', name: 'B' });
    expect(validate(g)).toEqual(['duplicate id "c"']);
  });

  it('rejects a reference to a missing concept', () => {
    const g = addProperty(blank(), { id: 'p', name: 'R', type: { kind: 'reference', concept: 'nope' } });
    expect(validate(g)).toEqual(['property "p" references missing concept "nope"']);
  });

  it('rejects a number range with min above max', () => {
    const g = addProperty(blank(), { id: 'p', name: 'N', type: { kind: 'number', min: 5, max: 1 } });
    expect(validate(g)).toEqual(['property "p" has min above max']);
  });

  it('rejects an entity value of the wrong type or for an unknown property', () => {
    let g = addConcept(blank(), { id: 'c', name: 'A' });
    g = addProperty(g, { owner: 'c', id: 'p', name: 'N', type: { kind: 'boolean' } });
    g = addEntity(g, { concept: 'c', id: 'e', name: 'E' });
    g = setEntityValue(g, 'e', 'p', 3);
    g = setEntityValue(g, 'e', 'ghost', 1);
    expect(validate(g)).toEqual(['entity "e" value for "p" does not fit its type', 'entity "e" has a value for unknown property "ghost"']);
  });
});

describe('validate: sets and components', () => {
  const sound = () => {
    let g = addConcept(blank(), { id: 'c', name: 'Player' });
    g = addSet(g, { id: 's', name: 'Deck' });
    g = addSet(g, { id: 't', name: 'Halves', parent: 's' });
    g = addProperty(g, { owner: 's', id: 'p', name: 'Cost', type: { kind: 'number', min: 0, max: 9 } });
    g = addComponent(g, { set: 't', id: 'k', name: 'Card' });
    return g;
  };

  it('accepts sound sets, and games with no sets key at all', () => {
    expect(validate(sound())).toEqual([]);
    const { sets, ...old } = blank();
    expect(validate(old)).toEqual([]);
  });

  it('rejects a malformed sets list', () => {
    expect(validate({ ...blank(), sets: 'x' })).toEqual(['sets must be an array']);
  });

  it('rejects duplicate ids across sets, components and properties', () => {
    const g = addComponent(sound(), { set: 's', id: 's', name: 'Clash' });
    expect(validate(g)).toEqual(['duplicate id "s"']);
  });

  it('rejects a bad count and a per-concept that does not exist', () => {
    let g = sound();
    g = { ...g, sets: [{ ...g.sets![0], children: [{ ...g.sets![0].children[0], components: [{ ...g.sets![0].children[0].components[0], count: -1 }] }] }] };
    g = addPer(g, 'k', 'ghost');
    expect(validate(g)).toEqual(['component "k" has an invalid count', 'component "k" is per missing concept "ghost"']);
  });

  it('rejects component values that are unknown or the wrong type', () => {
    let g = sound();
    g = addComponent(g, { set: 's', id: 'k2', name: 'Other' });
    g = setComponentValue(g, 'k2', 'p', 'many');
    g = setComponentValue(g, 'k2', 'ghost', 1);
    expect(validate(g)).toEqual(['component "k2" value for "p" does not fit its type', 'component "k2" has a value for unknown property "ghost"']);
  });
});

describe('validate: set geometry and templates', () => {
  const withLayer = () => addLayer(addSet(blank(), { id: 's', name: 'Deck' }), { set: 's', id: 'l', type: 'shape' });
  const patchSet = (g: Game, patch: Record<string, unknown>) => ({ ...g, sets: [{ ...g.sets![0], ...patch }] });

  it('accepts a set with geometry and layers', () => {
    expect(validate(patchSet(withLayer(), { size: { width: 50, height: 70 }, bleed: 3 }))).toEqual([]);
  });

  it('rejects a bad size, bleed, unknown layer type, bad box and duplicate layer id', () => {
    const g = withLayer();
    expect(validate(patchSet(g, { size: { width: 0, height: 5 } }))).toEqual(['set "s" has an invalid size']);
    expect(validate(patchSet(g, { bleed: -1 }))).toEqual(['set "s" has an invalid bleed']);
    expect(validate(patchSet(g, { template: 'x' }))).toEqual(['set "s" template must be an array']);
    expect(validate(patchSet(g, { template: [{ ...g.sets![0].template![0], type: 'blob' }] }))).toEqual(['layer "l" has an unknown type']);
    expect(validate(patchSet(g, { template: [{ ...g.sets![0].template![0], width: -1 }] }))).toEqual(['layer "l" has an invalid box']);
    expect(validate(patchSet(g, { template: [g.sets![0].template![0], g.sets![0].template![0]] }))).toEqual(['duplicate id "l"']);
  });
});
