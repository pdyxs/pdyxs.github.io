import { accepts, findSource, LAYER_PROPS } from './bindings.ts';
import { keyEntities } from './image.ts';
import { outlineProblem } from './path.ts';
import type { Binding, LayerType, ComponentSet, Concept, Game, Property, Value } from './types.ts';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const LAYER_TYPES = ['image', 'text', 'shape'];
const isPositive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** A bare filename in the card folder: not a URL, not a path. */
const isFilename = (v: unknown): v is string => typeof v === 'string' && v !== '' && !/[\\/:]/.test(v);

function fits(type: Property['type'], v: Value | undefined): boolean {
  switch (type.kind) {
    case 'image':
      if (type.variesBy) return isObject(v) && Object.values(v).every(isFilename);
      return v === null || isFilename(v);
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
  if (game.sets !== undefined && !Array.isArray(game.sets)) errors.push('sets must be an array');
  if (errors.length) return errors;

  const g = game as unknown as Game;
  const concepts: Concept[] = [];
  const walk = (list: Concept[]) => list.forEach((c) => { concepts.push(c); walk(c.children ?? []); });
  walk(g.concepts);

  const sets: ComponentSet[] = [];
  const walkSets = (list: ComponentSet[]) => list.forEach((s) => { sets.push(s); walkSets(s.children ?? []); });
  walkSets(g.sets ?? []);

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
    if (p.type.kind === 'image' && p.type.variesBy && !conceptIds.has(p.type.variesBy)) errors.push(`property "${p.id}" varies by missing concept "${p.type.variesBy}"`);
    if (p.type.kind === 'reference' && !conceptIds.has(p.type.concept)) errors.push(`property "${p.id}" references missing concept "${p.type.concept}"`);
  };

  g.properties.forEach(checkProperty);
  for (const c of concepts) {
    claim(c.id);
    c.properties.forEach(checkProperty);
    c.entities.forEach((e) => claim(e.id));
  }
  for (const s of sets) {
    claim(s.id);
    s.properties.forEach(checkProperty);
    for (const k of s.components) claim(k.id);
    const size = s.size as unknown;
    if (size !== undefined && !(isObject(size) && isPositive(size.width) && isPositive(size.height))) errors.push(`set "${s.id}" has an invalid size`);
    if (s.bleed !== undefined && !(typeof s.bleed === 'number' && Number.isFinite(s.bleed) && s.bleed >= 0)) errors.push(`set "${s.id}" has an invalid bleed`);
    if (s.outline !== undefined) {
      const problem = outlineProblem(s.outline);
      if (problem) errors.push(`set "${s.id}" has an invalid outline${problem === 'path' ? ' path' : ''}`);
    }
    const template = s.template as unknown;
    if (template === undefined) continue;
    if (!Array.isArray(template)) {
      errors.push(`set "${s.id}" template must be an array`);
      continue;
    }
    for (const layer of template as Record<string, unknown>[]) {
      claim(String(layer?.id));
      if (!LAYER_TYPES.includes(layer?.type as string)) errors.push(`layer "${layer?.id}" has an unknown type`);
      else if (!(Number.isFinite(layer.x) && Number.isFinite(layer.y) && isPositive(layer.width) && isPositive(layer.height))) errors.push(`layer "${layer.id}" has an invalid box`);
      else for (const [key, spec] of Object.entries(LAYER_PROPS[layer.type as LayerType])) {
        const prop = layer[key];
        if (!isObject(prop) || prop.kind !== 'bound') continue;
        const source = findSource(g, s.id, prop.source as Binding);
        if (!source || !accepts(spec.want, source.type)) errors.push(`layer "${layer.id}" prop "${key}" is bound to a source that no longer exists or does not fit`);
      }
    }
  }
  const checkValues = (owner: string, values: Record<string, Value>, allowed?: Property[]) => {
    for (const [pid, v] of Object.entries(values)) {
      const p = allowed ? allowed.find((q) => q.id === pid) : props.get(pid);
      if (!p) errors.push(`${owner} has a value for unknown property "${pid}"`);
      else if (!fits(p.type, v)) errors.push(`${owner} value for "${pid}" does not fit its type`);
      else if (p.type.kind === 'image' && p.type.variesBy && isObject(v)) {
        const entities = new Set(concepts.find((c) => c.id === (p.type as { variesBy: string }).variesBy)?.entities.map((e) => e.id));
        for (const key of Object.keys(v)) for (const id of keyEntities(key)) if (!entities.has(id)) errors.push(`${owner} has an image for missing entity "${id}" in "${pid}"`);
      }
    }
  };
  checkValues('game', g.values);
  for (const c of concepts) for (const e of c.entities) checkValues(`entity "${e.id}"`, e.values);
  for (const s of sets) {
    for (const k of s.components) {
      if (!Number.isInteger(k.count) || k.count < 0) errors.push(`component "${k.id}" has an invalid count`);
      for (const c of k.per) if (!conceptIds.has(c)) errors.push(`component "${k.id}" is per missing concept "${c}"`);
      checkValues(`component "${k.id}"`, k.values, s.properties);
    }
  }
  return errors;
}
