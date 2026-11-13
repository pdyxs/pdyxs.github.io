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

/** A group of components sharing a design (a deck, player mats, a board). */
export interface ComponentSet {
  id: string;
  name: string;
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
