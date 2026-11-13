import { describe, it, expect } from 'vitest';
import { resolve } from './resolve.ts';
import { blank } from '../model/game.ts';
import { expand, type Instance } from '../model/expand.ts';
import { addConcept, addEntity, addProperty, addSet, addComponent, addPer, setEntityValue, setComponentValue, removeProperty } from '../model/ops.ts';
import type { ComponentSet, Layer } from '../model/types.ts';

const instance: Instance = { component: 'k', index: 0, bound: {}, values: {} };
const game = blank();
const set = (over: Partial<ComponentSet> = {}): ComponentSet => ({ id: 's', name: 'S', substitute: '', properties: [], components: [], children: [], size: { width: 60, height: 80 }, bleed: 3, ...over });

describe('resolve: an empty card', () => {
  it('has the page size including bleed, the cut path, and no items', () => {
    const scene = resolve(set(), instance, game);
    expect(scene.size).toEqual({ width: 60, height: 80 });
    expect(scene.bleed).toBe(3);
    expect(scene.page).toEqual({ x: -3, y: -3, width: 66, height: 86 });
    expect(scene.cutPath).toBe('M0 0H60V80H0Z');
    expect(scene.items).toEqual([]);
  });
});

describe('resolve: bleed mask', () => {
  it('is the cut path filled and stroked at twice the bleed with round joins, whatever the shape', () => {
    const scene = resolve(set({ outline: { kind: 'circle' } }), instance, game);
    expect(scene.bleedMask).toEqual({ path: scene.cutPath, strokeWidth: 6, lineJoin: 'round' });
    expect(scene.page).toEqual({ x: -3, y: -3, width: 66, height: 66 });
  });
});

const shape = (over: Partial<Extract<Layer, { type: 'shape' }>> = {}): Layer => ({
  id: 'l1', type: 'shape', shape: 'rect', x: 10, y: 10, width: 20, height: 30,
  fill: { kind: 'literal', value: '#ff0000' }, stroke: { kind: 'literal', value: null }, strokeWidth: { kind: 'literal', value: 0.5 },
  ...over,
});

describe('resolve: shape layers', () => {
  it('emits a shape item with literals resolved, in the layer order', () => {
    const scene = resolve(set({ template: [shape(), shape({ id: 'l2', shape: 'ellipse' })] }), instance, game);
    expect(scene.items).toEqual([
      { kind: 'shape', id: 'l1', shape: 'rect', x: 10, y: 10, width: 20, height: 30, fill: '#ff0000', stroke: null, strokeWidth: 0.5 },
      { kind: 'shape', id: 'l2', shape: 'ellipse', x: 10, y: 10, width: 20, height: 30, fill: '#ff0000', stroke: null, strokeWidth: 0.5 },
    ]);
  });
});

const text = (over: Partial<Extract<Layer, { type: 'text' }>> = {}): Layer => ({
  id: 't1', type: 'text', x: 5, y: 6, width: 40, height: 10,
  text: { kind: 'literal', value: 'Hello\nthere' }, size: { kind: 'literal', value: 4 },
  colour: { kind: 'literal', value: '#111111' }, align: { kind: 'literal', value: 'center' },
  ...over,
});

describe('resolve: text layers', () => {
  it('emits a text item, split into lines', () => {
    const scene = resolve(set({ template: [text()] }), instance, game);
    expect(scene.items).toEqual([
      { kind: 'text', id: 't1', x: 5, y: 6, width: 40, height: 10, anchor: 'middle', lines: [{ text: 'Hello', x: 25, y: 10 }, { text: 'there', x: 25, y: 14 }], size: 4, colour: '#111111' },
    ]);
  });
});

const image = (file: string | null, over: Partial<Extract<Layer, { type: 'image' }>> = {}): Layer => ({
  id: 'i1', type: 'image', x: 0, y: 0, width: 30, height: 40,
  file: { kind: 'literal', value: file }, fit: { kind: 'literal', value: 'cover' },
  ...over,
});

describe('resolve: image layers', () => {
  it('emits an image item for a chosen file', () => {
    const scene = resolve(set({ bleed: 0, template: [image('art.png', { x: 5 })] }), instance, game);
    expect(scene.items).toEqual([{ kind: 'image', id: 'i1', x: 5, y: 0, width: 30, height: 40, file: 'art.png', fit: 'cover' }]);
  });

  it('marks a gap, with a reason, when no file is chosen', () => {
    const scene = resolve(set({ bleed: 0, template: [image(null, { x: 5 })] }), instance, game);
    expect(scene.items).toEqual([{ kind: 'gap', id: 'i1', x: 5, y: 0, width: 30, height: 40, reason: 'no image set' }]);
  });
});

describe('resolve: bleed extension', () => {
  it('extends edges on or beyond the cut line out to the bleed edge', () => {
    const full = shape({ x: 0, y: 0, width: 60, height: 40 });
    const scene = resolve(set({ template: [full] }), instance, game);
    expect(scene.items[0]).toMatchObject({ x: -3, y: -3, width: 66, height: 43 });
  });

  it('extends a layer that starts inside the bleed, and the far edges too', () => {
    const scene = resolve(set({ template: [shape({ x: -1, y: 50, width: 61, height: 30 })] }), instance, game);
    expect(scene.items[0]).toMatchObject({ x: -3, y: 50, width: 66, height: 33 });
  });

  it('leaves layers wholly inside the card alone, and gaps extend like images', () => {
    const scene = resolve(set({ template: [shape(), image(null, { x: 0, width: 60 })] }), instance, game);
    expect(scene.items[0]).toMatchObject({ x: 10, y: 10, width: 20, height: 30 });
    expect(scene.items[1]).toMatchObject({ kind: 'gap', x: -3, width: 66 });
  });

  it('does not stretch text, whose alignment depends on its box', () => {
    const scene = resolve(set({ template: [text({ x: 0, width: 60 })] }), instance, game);
    expect(scene.items[0]).toMatchObject({ x: 0, width: 60 });
  });
});

describe('resolve: bound props', () => {
  function bound() {
    let g = addConcept(blank(), { id: 'pl', name: 'Player' });
    g = addProperty(g, { owner: 'pl', id: 'col', name: 'Colour', type: { kind: 'colour' } });
    g = addEntity(g, { concept: 'pl', id: 'red', name: 'Red' });
    g = addEntity(g, { concept: 'pl', id: 'blue', name: 'Blue' });
    g = setEntityValue(g, 'red', 'col', '#ff0000');
    g = setEntityValue(g, 'blue', 'col', '#0000ff');
    g = addSet(g, { id: 's', name: 'Deck' });
    g = addProperty(g, { owner: 's', id: 'title', name: 'Title' });
    g = addComponent(g, { set: 's', id: 'k', name: 'Card' });
    g = setComponentValue(g, 'k', 'title', 'Zap');
    g = addPer(g, 'k', 'pl');
    return g;
  }
  const fillBound: Layer = shape({ fill: { kind: 'bound', source: { kind: 'entity', concept: 'pl', property: 'col' } } });
  const textBound: Layer = text({ text: { kind: 'bound', source: { kind: 'component', property: 'title' } } });

  it('resolves a shape fill from the bound entity and a text from a component property, per instance', () => {
    const g = bound();
    const t = set({ template: [fillBound, textBound] });
    const [red, blue] = expand(g, 's');
    expect(resolve(t, red, g).items).toMatchObject([{ kind: 'shape', id: 'l1', fill: '#ff0000' }, { kind: 'text', id: 't1', lines: [{ text: 'Zap' }] }]);
    expect(resolve(t, blue, g).items[0]).toMatchObject({ kind: 'shape', fill: '#0000ff' });
  });

  it('makes a layer whose binding cannot resolve a marked gap with the layer id and box, and keeps the others', () => {
    const g = removeProperty(bound(), 'col');
    const [red] = expand(g, 's');
    const scene = resolve(set({ template: [fillBound, textBound] }), red, g);
    expect(scene.items[0]).toMatchObject({ kind: 'gap', id: 'l1', x: 10, y: 10, width: 20, height: 30, reason: expect.stringContaining('fill') });
    expect(scene.items[1]).toMatchObject({ kind: 'text' });
  });

  it('gaps a bound enum prop whose value is not an allowed option', () => {
    const g = setComponentValue(bound(), 'k', 'title', 'sideways');
    const [red] = expand(g, 's');
    const scene = resolve(set({ template: [text({ align: { kind: 'bound', source: { kind: 'component', property: 'title' } } })] }), red, g);
    expect(scene.items[0]).toMatchObject({ kind: 'gap', id: 't1' });
  });

  it('binds an image layer file', () => {
    let g = addProperty(bound(), { owner: 's', id: 'art', name: 'Art', type: { kind: 'image' } });
    g = setComponentValue(g, 'k', 'art', 'a.png');
    const layer: Layer = { id: 'i1', type: 'image', x: 0, y: 0, width: 5, height: 5, file: { kind: 'bound', source: { kind: 'component', property: 'art' } }, fit: { kind: 'literal', value: 'cover' } };
    expect(resolve(set({ template: [layer] }), expand(g, 's')[0], g).items[0]).toMatchObject({ kind: 'image', file: 'a.png' });
  });
});
