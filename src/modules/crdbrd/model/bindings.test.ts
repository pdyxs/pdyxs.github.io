import { describe, it, expect } from 'vitest';
import { blank } from './game.ts';
import { addConcept, addEntity, addProperty, addSet, addComponent, addPer, setEntityValue, setComponentValue, setImageVariesBy, setImageSlot, removeProperty, removeConcept } from './ops.ts';
import { bindableSources, resolveBinding } from './bindings.ts';
import { expand } from './expand.ts';

function game() {
  let g = addConcept(blank(), { id: 'pl', name: 'Player' });
  g = addProperty(g, { owner: 'pl', id: 'col', name: 'Colour', type: { kind: 'colour' } });
  g = addProperty(g, { owner: 'pl', id: 'pname', name: 'Nick' });
  g = addConcept(g, { id: 'unused', name: 'Unused' });
  g = addProperty(g, { owner: 'unused', id: 'uv', name: 'U' });
  g = addSet(g, { id: 's', name: 'Deck' });
  g = addProperty(g, { owner: 's', id: 'title', name: 'Title' });
  g = addProperty(g, { owner: 's', id: 'owner', name: 'Owner', type: { kind: 'reference', concept: 'pl' } });
  g = addProperty(g, { owner: 's', id: 'art', name: 'Art', type: { kind: 'image' } });
  g = addComponent(g, { set: 's', id: 'k', name: 'Card' });
  return addPer(g, 'k', 'pl');
}

describe('bindableSources', () => {
  it('lists set properties, per-concept entity properties and reference targets, each with its type', () => {
    const sources = bindableSources(game(), 's');
    expect(sources.map((s) => [s.binding, s.type, s.label])).toEqual([
      [{ kind: 'component', property: 'title' }, 'text', 'Title'],
      [{ kind: 'component', property: 'owner' }, 'reference', 'Owner'],
      [{ kind: 'component', property: 'art' }, 'image', 'Art'],
      [{ kind: 'entity', concept: 'pl', property: 'col' }, 'colour', 'Player: Colour'],
      [{ kind: 'entity', concept: 'pl', property: 'pname' }, 'text', 'Player: Nick'],
      [{ kind: 'reference', via: 'owner', property: 'col' }, 'colour', 'Owner > Colour'],
      [{ kind: 'reference', via: 'owner', property: 'pname' }, 'text', 'Owner > Nick'],
    ]);
  });

  it('is empty for an unknown set', () => {
    expect(bindableSources(game(), 'nope')).toEqual([]);
  });
});

function full() {
  let g = game();
  g = addEntity(g, { concept: 'pl', id: 'red', name: 'Red' });
  g = addEntity(g, { concept: 'pl', id: 'blue', name: 'Blue' });
  g = setEntityValue(g, 'red', 'col', '#ff0000');
  g = setEntityValue(g, 'blue', 'col', '#0000ff');
  g = setComponentValue(g, 'k', 'title', 'Zap');
  g = setComponentValue(g, 'k', 'owner', 'blue');
  return g;
}
const first = (g: ReturnType<typeof full>) => expand(g, 's')[0];

describe('resolveBinding', () => {
  it('reads a component property, a per-concept entity property and a referenced entity property', () => {
    const g = full();
    const i = first(g);
    expect(resolveBinding(g, i, { kind: 'component', property: 'title' }, 'text')).toEqual({ value: 'Zap' });
    expect(resolveBinding(g, i, { kind: 'entity', concept: 'pl', property: 'col' }, 'colour')).toEqual({ value: '#ff0000' });
    expect(resolveBinding(g, i, { kind: 'reference', via: 'owner', property: 'col' }, 'colour')).toEqual({ value: '#0000ff' });
    expect(resolveBinding(g, expand(g, 's')[1], { kind: 'entity', concept: 'pl', property: 'col' }, 'colour')).toEqual({ value: '#0000ff' });
  });

  it('takes a number where text is wanted, as text, but not the other way round', () => {
    let g = addProperty(full(), { owner: 's', id: 'cost', name: 'Cost', type: { kind: 'number', min: 1, max: 9 } });
    g = setComponentValue(g, 'k', 'cost', 4);
    const i = first(g);
    expect(resolveBinding(g, i, { kind: 'component', property: 'cost' }, 'text')).toEqual({ value: '4' });
    expect(resolveBinding(g, i, { kind: 'component', property: 'cost' }, 'number')).toEqual({ value: 4 });
    expect(resolveBinding(g, i, { kind: 'component', property: 'title' }, 'number')).toMatchObject({ gap: expect.stringContaining('type') });
  });

  it('resolves image properties through imageFor, including varies-by', () => {
    let g = addConcept(full(), { id: 'act', name: 'Action' });
    g = addEntity(g, { concept: 'act', id: 'a1', name: 'Run' });
    g = addProperty(g, { owner: 'act', id: 'face', name: 'Face', type: { kind: 'image' } });
    g = setImageVariesBy(g, 'face', 'pl');
    g = setImageSlot(g, 'a1', 'face', 'red', 'red.png');
    g = addPer(g, 'k', 'act');
    const [a, b] = expand(g, 's');
    const src = { kind: 'entity', concept: 'act', property: 'face' } as const;
    expect(resolveBinding(g, a, src, 'image')).toEqual({ value: 'red.png' });
    expect(resolveBinding(g, b, src, 'image')).toMatchObject({ gap: expect.any(String) });
  });

  it('is a gap, never a throw, for a missing property, concept, entity or empty reference', () => {
    const g = full();
    const i = first(g);
    for (const src of [
      { kind: 'component', property: 'nope' }, { kind: 'entity', concept: 'nope', property: 'col' }, { kind: 'entity', concept: 'pl', property: 'nope' },
      { kind: 'reference', via: 'nope', property: 'col' }, { kind: 'reference', via: 'owner', property: 'nope' }, { kind: 'reference', via: 'title', property: 'col' },
    ] as const) expect(resolveBinding(g, i, src, 'colour')).toHaveProperty('gap');
    expect(resolveBinding(g, { ...i, bound: {} }, { kind: 'entity', concept: 'pl', property: 'col' }, 'colour')).toHaveProperty('gap');
    expect(resolveBinding(g, { ...i, values: { ...i.values, owner: null } }, { kind: 'reference', via: 'owner', property: 'col' }, 'colour')).toHaveProperty('gap');
    expect(resolveBinding(g, { ...i, values: { ...i.values, owner: 'ghost' } }, { kind: 'reference', via: 'owner', property: 'col' }, 'colour')).toHaveProperty('gap');
  });

  it('gaps once the property or concept it used is removed', () => {
    const g = full();
    const i = first(g);
    expect(resolveBinding(removeProperty(g, 'title'), i, { kind: 'component', property: 'title' }, 'text')).toHaveProperty('gap');
    expect(resolveBinding(removeConcept(g, 'pl'), i, { kind: 'entity', concept: 'pl', property: 'col' }, 'colour')).toHaveProperty('gap');
  });
});
