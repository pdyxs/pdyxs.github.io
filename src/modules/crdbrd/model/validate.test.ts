import { describe, it, expect } from 'vitest';
import { blank } from './game.ts';
import { validate } from './validate.ts';
import { addConcept, addEntity, addProperty, setEntityValue } from './ops.ts';

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
