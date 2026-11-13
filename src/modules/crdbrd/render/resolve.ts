// resolve: a set's template plus one instance becomes a Scene, plain data in
// mm with everything decided. No Svelte, no DOM. Origin is the cut line's
// top-left; the page (cut line plus bleed) therefore starts at -bleed.

import type { Game, ImageFit, Layer, TextAlign, TextLayer, ComponentSet } from '../model/types.ts';
import { readLayerProps } from '../model/bindings.ts';
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
  /** What the view clips the template to: the cut path filled, plus a stroke of 2 x bleed, which offsets any shape outward exactly. */
  bleedMask: { path: string; strokeWidth: number; lineJoin: 'round' };
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
  | (ItemBase & { kind: 'text'; anchor: 'start' | 'middle' | 'end'; lines: { text: string; x: number; y: number }[]; size: number; colour: string });

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

/** Lines of text placed in mm: first baseline one font size below the box top, then a line height of the font size. */
function textLines(layer: TextLayer, v: Record<string, unknown>) {
  const align = v.align as TextAlign;
  const size = v.size as number;
  const x = align === 'left' ? layer.x : align === 'right' ? layer.x + layer.width : layer.x + layer.width / 2;
  const lines = (v.text as string).split('\n').map((text, i) => ({ text, x, y: layer.y + size * (i + 1) }));
  return { anchor: (align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle') as 'start' | 'middle' | 'end', lines, size, colour: v.colour as string };
}

function resolveLayer(layer: Layer, size: { width: number; height: number }, bleed: number, instance: Instance, game: Game): Item {
  const { id } = layer;
  // Text keeps its box: its alignment is measured from the box edges.
  const { x, y, width, height } = layer.type === 'text' ? layer : extendToBleed(layer, size, bleed);
  const props = readLayerProps(game, instance, layer);
  if ('gap' in props) return { kind: 'gap', id, x, y, width, height, reason: props.gap };
  const v = props.values;
  switch (layer.type) {
    case 'shape':
      return { kind: 'shape', id, shape: layer.shape, x, y, width, height, fill: v.fill as string | null, stroke: v.stroke as string | null, strokeWidth: v.strokeWidth as number };
    case 'text':
      return { kind: 'text', id, x, y, width, height, ...textLines(layer, v) };
    case 'image': {
      const file = v.file as string | null;
      return file ? { kind: 'image', id, x, y, width, height, file, fit: v.fit as ImageFit } : { kind: 'gap', id, x, y, width, height, reason: 'no image set' };
    }
  }
}

export function resolve(template: Template, instance: Instance, game: Game): Scene {
  const { cutPath, size, bleed } = outline(template);
  return { size, bleed, page: { x: -bleed, y: -bleed, width: size.width + 2 * bleed, height: size.height + 2 * bleed }, cutPath, bleedMask: { path: cutPath, strokeWidth: bleed * 2, lineJoin: 'round' }, items: (template.template ?? []).map((l) => resolveLayer(l, size, bleed, instance, game)) };
}
