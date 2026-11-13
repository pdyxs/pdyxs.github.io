import type { Concept, Game, Property, Value } from './types.ts';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function fits(type: Property['type'], v: Value | undefined): boolean {
  switch (type.kind) {
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    case 'text':
    case 'colour': return typeof v === 'string';
    case 'boolean': return typeof v === 'boolean';
    case 'reference': return v === null || typeof v === 'string';
  }
}

/** Errors for `game`; empty means valid. Takes unknown, because it checks data read from disk. */
export function validate(game: unknown): string[] {
  if (!isObject(game)) return ['game must be an object'];
  const errors: string[] = [];
  if (typeof game.name !== 'string') errors.push('name must be a string');
  if (!Array.isArray(game.properties)) errors.push('properties must be an array');
  if (!isObject(game.values)) errors.push('values must be an object');
  if (!Array.isArray(game.concepts)) errors.push('concepts must be an array');
  if (errors.length) return errors;

  const g = game as unknown as Game;
  const concepts: Concept[] = [];
  const walk = (list: Concept[]) => list.forEach((c) => { concepts.push(c); walk(c.children ?? []); });
  walk(g.concepts);

  const seen = new Set<string>();
  const claim = (id: string) => {
    if (seen.has(id)) errors.push(`duplicate id "${id}"`);
    seen.add(id);
  };
  const conceptIds = new Set(concepts.map((c) => c.id));
  const props = new Map<string, Property>();
  const checkProperty = (p: Property) => {
    claim(p.id);
    props.set(p.id, p);
    if (p.type.kind === 'number' && p.type.min > p.type.max) errors.push(`property "${p.id}" has min above max`);
    if (p.type.kind === 'reference' && !conceptIds.has(p.type.concept)) errors.push(`property "${p.id}" references missing concept "${p.type.concept}"`);
  };

  g.properties.forEach(checkProperty);
  for (const c of concepts) {
    claim(c.id);
    c.properties.forEach(checkProperty);
    c.entities.forEach((e) => claim(e.id));
  }
  const checkValues = (owner: string, values: Record<string, Value>) => {
    for (const [pid, v] of Object.entries(values)) {
      const p = props.get(pid);
      if (!p) errors.push(`${owner} has a value for unknown property "${pid}"`);
      else if (!fits(p.type, v)) errors.push(`${owner} value for "${pid}" does not fit its type`);
    }
  };
  checkValues('game', g.values);
  for (const c of concepts) for (const e of c.entities) checkValues(`entity "${e.id}"`, e.values);
  return errors;
}
