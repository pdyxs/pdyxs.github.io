// resolve: a set's template plus one instance becomes a Scene, plain data in
// mm with everything decided. No Svelte, no DOM. Origin is the cut line's
// top-left; the page (cut line plus bleed) therefore starts at -bleed.

import type { Game, ImageFit, Layer, ComponentSet } from '../model/types.ts';
import type { Instance } from '../model/expand.ts';
import { outline } from './outline.ts';

/** The part of a set that describes how its pieces look: geometry plus layers. */
export type Template = Pick<ComponentSet, 'size' | 'bleed' | 'outline' | 'template'>;

export interface Scene {
  size: { width: number; height: number };
  bleed: number;
  /** The whole printed area: cut line plus bleed on every side. */
  page: { x: number; y: number; width: number; height: number };
  cutPath: string;
  items: Item[];
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type ItemBase = Rect & { id: string };
export type Item =
  | (ItemBase & { kind: 'shape'; shape: 'rect' | 'ellipse'; fill: string | null; stroke: string | null; strokeWidth: number })
  | (ItemBase & { kind: 'image'; file: string; fit: ImageFit })
  | (ItemBase & { kind: 'gap'; reason: string })
  | (ItemBase & { kind: 'text'; lines: string[]; size: number; colour: string; align: 'left' | 'center' | 'right' });

/** A literal prop's value. The one place that will learn to read bound props. */
const read = <T>(prop: { kind: 'literal'; value: T }): T => prop.value;

/**
 * A box whose edge sits on or past the cut line is drawn out to the bleed edge,
 * so a full-bleed design survives trimming. The far edges are compared with the
 * card size; the near edges with zero.
 */
export function extendToBleed(box: Rect, size: { width: number; height: number }, bleed: number): Rect {
  const left = box.x <= 0 ? 0 - bleed : box.x;
  const top = box.y <= 0 ? 0 - bleed : box.y;
  const right = box.x + box.width >= size.width ? size.width + bleed : box.x + box.width;
  const bottom = box.y + box.height >= size.height ? size.height + bleed : box.y + box.height;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function resolveLayer(layer: Layer, size: { width: number; height: number }, bleed: number): Item {
  const { id } = layer;
  // Text keeps its box: its alignment is measured from the box edges.
  const { x, y, width, height } = layer.type === 'text' ? layer : extendToBleed(layer, size, bleed);
  switch (layer.type) {
    case 'shape':
      return { kind: 'shape', id, shape: layer.shape, x, y, width, height, fill: read(layer.fill), stroke: read(layer.stroke), strokeWidth: read(layer.strokeWidth) };
    case 'text':
      return { kind: 'text', id, x, y, width, height, lines: read(layer.text).split('\n'), size: read(layer.size), colour: read(layer.colour), align: read(layer.align) };
    case 'image': {
      const file = read(layer.file);
      return file ? { kind: 'image', id, x, y, width, height, file, fit: read(layer.fit) } : { kind: 'gap', id, x, y, width, height, reason: 'no image set' };
    }
  }
}

export function resolve(template: Template, _instance: Instance, _game: Game): Scene {
  const { cutPath, size, bleed } = outline(template);
  return { size, bleed, page: { x: -bleed, y: -bleed, width: size.width + 2 * bleed, height: size.height + 2 * bleed }, cutPath, items: (template.template ?? []).map((l) => resolveLayer(l, size, bleed)) };
}
