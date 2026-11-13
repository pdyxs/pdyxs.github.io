// resolve: a set's template plus one instance becomes a Scene, plain data in
// mm with everything decided. No Svelte, no DOM. Origin is the cut line's
// top-left; the page (cut line plus bleed) therefore starts at -bleed.

import type { Game, Layer, ComponentSet } from '../model/types.ts';
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

export type Item = never;

export function resolve(template: Template, _instance: Instance, _game: Game): Scene {
  const { cutPath, size, bleed } = outline(template);
  return { size, bleed, page: { x: -bleed, y: -bleed, width: size.width + 2 * bleed, height: size.height + 2 * bleed }, cutPath, items: [] };
}
