// The crdbrd game model (the 2018 model, kept as is). Pure data: no card or
// site concepts live here, so the format could one day be its own tool.

/** Image comes in a later issue; the union leaves room for it. */
export type PropertyType =
  | { kind: 'number'; min: number; max: number }
  | { kind: 'text' }
  | { kind: 'colour' }
  | { kind: 'boolean' }
  | { kind: 'reference'; concept: string };

export type Value = number | string | boolean | null;

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

export interface Game {
  name: string;
  properties: Property[];
  values: Record<string, Value>;
  concepts: Concept[];
}
