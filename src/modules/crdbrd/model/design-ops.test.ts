import { describe, it, expect } from 'vitest';
import { blank } from './game.ts';
import { addSet } from './ops.ts';
import { setSetSize, setSetBleed, setOutlineRadius, setOutline, addLayer, removeLayer, moveLayer, setLayerBox, setLayerProp, setShapeKind, bindLayerProp, unbindLayerProp } from './ops.ts';
import { findSet, geometryOf, templateOf } from './query.ts';

const base = () => addSet(blank(), { id: 's', name: 'Deck' });

describe('set geometry ops', () => {
  it('sets the size, the bleed and the corner radius', () => {
    let g = setSetSize(base(), 's', { width: 50, height: 70 });
    g = setSetBleed(g, 's', 2);
    g = setOutlineRadius(g, 's', 4);
    expect(geometryOf(findSet(g, 's')!)).toEqual({ size: { width: 50, height: 70 }, bleed: 2, outline: { kind: 'rectangle', radius: 4 } });
  });

  it('refuses sizes that are not positive and bleed or radius that is negative', () => {
    let g = setSetSize(base(), 's', { width: 0, height: -5 });
    g = setSetBleed(g, 's', -1);
    g = setOutlineRadius(g, 's', Number.NaN);
    expect(geometryOf(findSet(g, 's')!)).toEqual({ size: { width: 63.5, height: 88.9 }, bleed: 0, outline: { kind: 'rectangle' } });
  });
});

describe('layer ops', () => {
  const layers = (g: ReturnType<typeof base>) => templateOf(findSet(g, 's')!);

  it('adds a layer of each type, with literal defaults, at the end of the draw order', () => {
    let g = addLayer(base(), { set: 's', id: 'a', type: 'shape' });
    g = addLayer(g, { set: 's', id: 'b', type: 'text' });
    g = addLayer(g, { set: 's', id: 'c', type: 'image' });
    expect(layers(g).map((l) => [l.id, l.type])).toEqual([['a', 'shape'], ['b', 'text'], ['c', 'image']]);
    const [shape, text, image] = layers(g);
    expect(shape).toMatchObject({ shape: 'rect', fill: { kind: 'literal', value: '#cccccc' } });
    expect(text).toMatchObject({ text: { kind: 'literal', value: 'Text' } });
    expect(image).toMatchObject({ file: { kind: 'literal', value: null }, fit: { kind: 'literal', value: 'cover' } });
  });

  it('places a new layer inside the card, scaled to its size', () => {
    const g = addLayer(setSetSize(base(), 's', { width: 40, height: 60 }), { set: 's', id: 'a', type: 'shape' });
    expect(layers(g)[0]).toMatchObject({ x: 0, y: 0, width: 40, height: 60 });
  });

  it('removes a layer by id', () => {
    let g = addLayer(addLayer(base(), { set: 's', id: 'a', type: 'shape' }), { set: 's', id: 'b', type: 'text' });
    g = removeLayer(g, 'a');
    expect(layers(g).map((l) => l.id)).toEqual(['b']);
  });
});

describe('layer reordering and editing', () => {
  const three = () => {
    let g = base();
    for (const id of ['a', 'b', 'c']) g = addLayer(g, { set: 's', id, type: 'shape' });
    return g;
  };
  const order = (g: ReturnType<typeof base>) => templateOf(findSet(g, 's')!).map((l) => l.id);

  it('moves a layer one step earlier or later in the draw order, staying put at the ends', () => {
    expect(order(moveLayer(three(), 'b', 1))).toEqual(['a', 'c', 'b']);
    expect(order(moveLayer(three(), 'b', -1))).toEqual(['b', 'a', 'c']);
    expect(order(moveLayer(three(), 'a', -1))).toEqual(['a', 'b', 'c']);
    expect(order(moveLayer(three(), 'c', 1))).toEqual(['a', 'b', 'c']);
  });

  it('edits a layer box, ignoring non-finite values and non-positive sizes', () => {
    let g = setLayerBox(three(), 'a', { x: 5, width: 10 });
    g = setLayerBox(g, 'a', { height: 0, y: Number.NaN });
    expect(templateOf(findSet(g, 's')!)[0]).toMatchObject({ x: 5, y: 0, width: 10, height: 88.9 });
  });

  it('sets a literal prop by name, wrapping it as a literal', () => {
    const g = setLayerProp(three(), 'a', 'fill', '#ff0000');
    expect(templateOf(findSet(g, 's')!)[0]).toMatchObject({ fill: { kind: 'literal', value: '#ff0000' } });
  });

  it('ignores a prop the layer type does not have, and switches a shape between rect and ellipse', () => {
    const g0 = three();
    expect(setLayerProp(g0, 'a', 'text', 'x')).toBe(g0);
    expect(templateOf(findSet(setShapeKind(g0, 'a', 'ellipse'), 's')!)[0]).toMatchObject({ shape: 'ellipse' });
  });
});

describe('setOutline', () => {
  it('sets any outline shape and keeps it in the geometry', () => {
    let g = setOutline(base(), 's', { kind: 'hexagon', orientation: 'flat', measure: 'point-to-point' });
    expect(geometryOf(findSet(g, 's')!).outline).toEqual({ kind: 'hexagon', orientation: 'flat', measure: 'point-to-point' });
    g = setOutline(g, 's', { kind: 'circle' });
    expect(geometryOf(findSet(g, 's')!).outline).toEqual({ kind: 'circle' });
    g = setOutline(g, 's', { kind: 'custom', path: 'bad' });
    expect(geometryOf(findSet(g, 's')!).outline).toEqual({ kind: 'custom', path: 'bad' });
  });

  it('refuses a negative radius or an unknown hexagon option', () => {
    const g = base();
    expect(setOutline(g, 's', { kind: 'rectangle', radius: -1 })).toBe(g);
    expect(setOutline(g, 's', { kind: 'hexagon', orientation: 'sideways' as never, measure: 'flat-to-flat' })).toBe(g);
  });
});

describe('binding a layer prop', () => {
  const g0 = () => addLayer(addLayer(base(), { set: 's', id: 'a', type: 'shape' }), { set: 's', id: 't', type: 'text' });
  const layer = (g: ReturnType<typeof base>, id: string) => templateOf(findSet(g, 's')!).find((l) => l.id === id)!;
  const source = { kind: 'entity', concept: 'pl', property: 'col' } as const;

  it('binds a prop to a source and unbinds it back to the default literal', () => {
    const bound = bindLayerProp(g0(), 'a', 'fill', source);
    expect(layer(bound, 'a')).toMatchObject({ fill: { kind: 'bound', source } });
    expect(layer(unbindLayerProp(bound, 'a', 'fill'), 'a')).toMatchObject({ fill: { kind: 'literal', value: '#cccccc' } });
  });

  it('ignores a prop the layer does not have, and lets a literal edit replace a binding', () => {
    const g = g0();
    expect(bindLayerProp(g, 'a', 'text', source)).toBe(g);
    expect(unbindLayerProp(g, 'a', 'text')).toBe(g);
    expect(layer(setLayerProp(bindLayerProp(g, 'a', 'fill', source), 'a', 'fill', '#00ff00'), 'a')).toMatchObject({ fill: { kind: 'literal', value: '#00ff00' } });
  });
});
