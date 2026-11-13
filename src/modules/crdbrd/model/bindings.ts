// Bindings: what a layer prop can read from the model, and how a binding
// resolves for one instance. Pure; the form's pickers and `resolve` both go
// through here, so "what can bind" and "what a binding means" cannot drift.

import type { Binding, Concept, Game, Layer, LayerType, Prop, Property, PropertyType, Value } from './types.ts';
import type { Instance } from './expand.ts';
import { imageFor, type OwnerRef } from './image.ts';
import { allProperties, findConcept, findSet, valueOf } from './query.ts';

/** One thing a layer prop can bind to, with what the form needs to list it. */
export interface Source {
  binding: Binding;
  /** The kind of value it yields. */
  type: PropertyType['kind'];
  label: string;
}

/** Everything in `game` a layer in set `setId` can bind to, in a stable order. */
export function bindableSources(game: Game, setId: string): Source[] {
  const set = findSet(game, setId);
  if (!set) return [];
  const out: Source[] = [];
  for (const p of set.properties) out.push({ binding: { kind: 'component', property: p.id }, type: p.type.kind, label: p.name });

  const perIds = [...new Set(set.components.flatMap((c) => c.per))];
  for (const id of perIds) {
    const concept = findConcept(game, id);
    for (const p of concept?.properties ?? []) out.push({ binding: { kind: 'entity', concept: id, property: p.id }, type: p.type.kind, label: `${concept!.name}: ${p.name}` });
  }

  for (const via of set.properties) {
    if (via.type.kind !== 'reference') continue;
    for (const p of findConcept(game, via.type.concept)?.properties ?? []) out.push({ binding: { kind: 'reference', via: via.id, property: p.id }, type: p.type.kind, label: `${via.name} > ${p.name}` });
  }
  return out;
}

/** What a layer prop wants: a string, a number, a colour or an image filename. */
export type WantKind = 'text' | 'number' | 'colour' | 'image';

export type Resolved = { value: string | number } | { gap: string };

/** Whether a property of this type can fill a prop that wants `want`. A number may stand in for text. */
export function accepts(want: WantKind, type: PropertyType['kind']): boolean {
  return want === 'text' ? type === 'text' || type === 'number' : want === type;
}

function fromProperty(game: Game, owner: OwnerRef, property: Property | undefined, value: Value | undefined, instance: Instance, want: WantKind): Resolved {
  if (!property) return { gap: 'no such property' };
  if (!accepts(want, property.type.kind)) return { gap: `wrong type: ${property.type.kind}, not ${want}` };
  if (want === 'image') {
    const image = imageFor(game, owner, property.id, instance.bound);
    return 'file' in image ? { value: image.file } : image;
  }
  if (typeof value === 'number') return { value: want === 'text' ? String(value) : value };
  return typeof value === 'string' ? { value } : { gap: 'no value' };
}

/** The value `binding` yields for one instance. A binding that cannot resolve is a gap with a reason, never a throw. */
export function resolveBinding(game: Game, instance: Instance, binding: Binding, want: WantKind): Resolved {
  switch (binding.kind) {
    case 'component': {
      const property = allProperties(game).find((p) => p.id === binding.property);
      if (!(binding.property in instance.values)) return { gap: 'no such property' };
      return fromProperty(game, { component: instance.component }, property, instance.values[binding.property], instance, want);
    }
    case 'entity': {
      const concept = findConcept(game, binding.concept);
      if (!concept) return { gap: `no such concept ${binding.concept}` };
      const id = instance.bound[binding.concept];
      if (id === undefined) return { gap: `not bound to ${concept.name}` };
      return fromEntity(game, concept, id, binding.property, instance, want);
    }
    case 'reference': {
      if (!(binding.via in instance.values)) return { gap: 'no such property' };
      const via = allProperties(game).find((p) => p.id === binding.via);
      if (via?.type.kind !== 'reference') return { gap: 'not a reference property' };
      const concept = findConcept(game, via.type.concept);
      if (!concept) return { gap: `no such concept ${via.type.concept}` };
      const id = instance.values[binding.via];
      if (typeof id !== 'string') return { gap: `no ${concept.name} chosen` };
      return fromEntity(game, concept, id, binding.property, instance, want);
    }
  }
}

function fromEntity(game: Game, concept: Concept, entityId: string, propertyId: string, instance: Instance, want: WantKind): Resolved {
  const entity = concept.entities.find((e) => e.id === entityId);
  if (!entity) return { gap: `no such ${concept.name} entity ${entityId}` };
  const property = concept.properties.find((p) => p.id === propertyId);
  return fromProperty(game, { entity: entity.id }, property, property && valueOf(entity, property), instance, want);
}

/** What each layer prop wants, so the form can offer matching sources and `resolve` can check what it gets. */
export interface PropSpec {
  want: WantKind;
  /** The only values allowed, for a prop that is a choice rather than free text. */
  options?: readonly string[];
  /** A number prop that must be above zero. */
  positive?: boolean;
}
export const LAYER_PROPS: Record<LayerType, Record<string, PropSpec>> = {
  shape: { fill: { want: 'colour' }, stroke: { want: 'colour' }, strokeWidth: { want: 'number' } },
  text: { text: { want: 'text' }, size: { want: 'number', positive: true }, colour: { want: 'colour' }, align: { want: 'text', options: ['left', 'center', 'right'] } },
  image: { file: { want: 'image' }, fit: { want: 'text', options: ['contain', 'cover', 'stretch'] } },
};

/** Every prop of `layer` as a plain value, or the first reason one cannot be had. */
export function readLayerProps(game: Game, instance: Instance, layer: Layer): { values: Record<string, unknown> } | { gap: string } {
  const values: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(LAYER_PROPS[layer.type])) {
    const prop = (layer as unknown as Record<string, Prop<unknown>>)[key];
    if (prop.kind === 'literal') { values[key] = prop.value; continue; }
    const r = resolveBinding(game, instance, prop.source, spec.want);
    if ('gap' in r) return { gap: `${key}: ${r.gap}` };
    if (spec.options && !spec.options.includes(String(r.value))) return { gap: `${key}: "${r.value}" is not one of ${spec.options.join(', ')}` };
    if (spec.positive && !(Number(r.value) > 0)) return { gap: `${key}: must be above zero` };
    values[key] = r.value;
  }
  return { values };
}

/** The listed source a stored binding points at, or undefined when it no longer exists in `game`. */
export function findSource(game: Game, setId: string, binding: Binding): Source | undefined {
  const same = (a: Binding): boolean => a.kind === binding.kind && a.property === binding.property
    && (a.kind !== 'entity' || binding.kind !== 'entity' || a.concept === binding.concept)
    && (a.kind !== 'reference' || binding.kind !== 'reference' || a.via === binding.via);
  return bindableSources(game, setId).find((s) => same(s.binding));
}
