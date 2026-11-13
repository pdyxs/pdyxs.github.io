// The crdbrd game model (the 2018 model, kept as is). Pure data: no card or
// site concepts live here, so the format could one day be its own tool.

export type PropertyType =
  | { kind: 'number'; min: number; max: number }
  | { kind: 'text' }
  | { kind: 'colour' }
  | { kind: 'boolean' }
  | { kind: 'reference'; concept: string }
  /** `variesBy`: the concept whose entities each get their own image (see image.ts). Only concept properties vary. */
  | { kind: 'image'; variesBy?: string };

/**
 * An image value is a filename (never a URL). A varies-by image is instead a
 * record of filenames keyed by binding key (`bindingKey` in image.ts), not by
 * bare entity id, so varying by several concepts later needs no migration.
 */
export type ImageSlots = Record<string, string>;

export type Value = number | string | boolean | null | ImageSlots;

export interface Property {
  id: string;
  name: string;
  type: PropertyType;
}

export interface Entity {
  id: string;
  name: string;
  /** Explicit values by property id; a missing one falls back to the type's default. */
  values: Record<string, Value>;
}

export interface Concept {
  id: string;
  name: string;
  /** How many of these the game has, as a hint. */
  count: number;
  properties: Property[];
  entities: Entity[];
  children: Concept[];
}

/** One entry in a set: how many, optionally per entity of each listed concept, with its own values. */
export interface Component {
  id: string;
  name: string;
  /** Instances per binding (or in total when `per` is empty). */
  count: number;
  /** Concept ids; one instance group is made for every combination of their entities. */
  per: string[];
  /** Explicit values by the set's property ids; a missing one falls back to the type's default. */
  values: Record<string, Value>;
}

/**
 * Where a bound layer prop reads its value. Stored by id only; what each one
 * means in the current game is decided by `bindableSources` and `resolveBinding`
 * (bindings.ts), so a binding whose target was deleted simply stops resolving.
 */
export type Binding =
  /** A property of the set, read from the instance's component. */
  | { kind: 'component'; property: string }
  /** A property of the entity the instance is bound to for a per-concept. */
  | { kind: 'entity'; concept: string; property: string }
  /** A property of the entity a reference-typed set property points at. */
  | { kind: 'reference'; via: string; property: string };

/** A layer property: a literal, or bound to the model. */
export type Prop<T> = { kind: 'literal'; value: T } | { kind: 'bound'; source: Binding };

/** Millimetres, relative to the cut line's top-left corner. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ImageFit = 'contain' | 'cover' | 'stretch';
export type TextAlign = 'left' | 'center' | 'right';

interface LayerBase extends Box {
  id: string;
}
export interface ImageLayer extends LayerBase {
  type: 'image';
  file: Prop<string | null>;
  fit: Prop<ImageFit>;
}
export interface TextLayer extends LayerBase {
  type: 'text';
  text: Prop<string>;
  /** Font size in mm. */
  size: Prop<number>;
  colour: Prop<string>;
  align: Prop<TextAlign>;
}
export interface ShapeLayer extends LayerBase {
  type: 'shape';
  shape: 'rect' | 'ellipse';
  fill: Prop<string | null>;
  stroke: Prop<string | null>;
  /** Stroke width in mm. */
  strokeWidth: Prop<number>;
}
/** Layer order is draw order, first drawn first (at the back). Holds data only, no UI state. */
export type Layer = ImageLayer | TextLayer | ShapeLayer;
export type LayerType = Layer['type'];

/**
 * The cut shape of a set. `size` on the set is the shape's bounding box, except
 * where noted: a circle's diameter is the width; a hexagon's width is its
 * `measure` (the other side follows from the regular shape); a custom path is
 * drawn in mm inside the set's size.
 */
export type Outline =
  | { kind: 'rectangle'; radius?: number }
  | { kind: 'circle' }
  | { kind: 'hexagon'; orientation: 'pointy' | 'flat'; measure: 'flat-to-flat' | 'point-to-point' }
  | { kind: 'custom'; path: string };

/** A group of components sharing a design (a deck, player mats, a board). */
export interface ComponentSet {
  id: string;
  name: string;
  /** Physical size of the cut line in mm. Absent in older games; read through `geometryOf`. */
  size?: { width: number; height: number };
  /** Bleed past the cut line in mm. */
  bleed?: number;
  outline?: Outline;
  template?: Layer[];
  /** Plain text shown later by the rulebook / print-and-play when the piece can be swapped. */
  substitute: string;
  properties: Property[];
  components: Component[];
  children: ComponentSet[];
}

export interface Game {
  name: string;
  properties: Property[];
  values: Record<string, Value>;
  concepts: Concept[];
  /** Absent in games saved before sets existed; read it through `setsOf`. */
  sets?: ComponentSet[];
}
