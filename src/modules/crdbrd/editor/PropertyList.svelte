<script lang="ts">
  import type { Game, Property, PropertyType } from '../model/types.ts';
  import { addProperty, removeProperty, renameProperty, setImageVariesBy, setPropertyType } from '../model/ops.ts';
  import { allConcepts, findConcept } from '../model/query.ts';
  import { newId } from './ids.ts';
  import AddForm from './AddForm.svelte';

  /** `owner` is a concept id, or undefined for the game's own properties. */
  let { game, owner, properties, readOnly, onChange }: {
    game: Game; owner?: string; properties: Property[]; readOnly: boolean; onChange: (next: Game) => void;
  } = $props();

  const KINDS: PropertyType['kind'][] = ['number', 'text', 'colour', 'boolean', 'reference', 'image'];
  const concepts = $derived(allConcepts(game));

  function typeOfKind(kind: PropertyType['kind']): PropertyType {
    switch (kind) {
      case 'number': return { kind, min: 0, max: 10 };
      case 'reference': return { kind, concept: concepts[0]?.id ?? '' };
      default: return { kind } as PropertyType;
    }
  }
  /** Only a concept's own properties can vary (each entity holds one image per entity of the other concept). */
  const ownedByConcept = $derived(owner !== undefined && findConcept(game, owner) !== undefined);
  const num = (s: string, fallback: number) => (Number.isFinite(parseFloat(s)) ? parseFloat(s) : fallback);
</script>

<ul class="properties">
  {#each properties as p (p.id)}
    <li class="property-row">
      <input class="prop-name" type="text" value={p.name} disabled={readOnly} aria-label="Property name" oninput={(e) => onChange(renameProperty(game, p.id, e.currentTarget.value))} />
      <select class="prop-type" value={p.type.kind} disabled={readOnly} aria-label="Property type" onchange={(e) => onChange(setPropertyType(game, p.id, typeOfKind(e.currentTarget.value as PropertyType['kind'])))}>
        {#each KINDS as k}<option value={k}>{k}</option>{/each}
      </select>
      {#if p.type.kind === 'number'}
        {@const t = p.type}
        <input class="prop-min" type="number" value={t.min} disabled={readOnly} aria-label="Minimum" oninput={(e) => onChange(setPropertyType(game, p.id, { ...t, min: num(e.currentTarget.value, t.min) }))} />
        <input class="prop-max" type="number" value={t.max} disabled={readOnly} aria-label="Maximum" oninput={(e) => onChange(setPropertyType(game, p.id, { ...t, max: num(e.currentTarget.value, t.max) }))} />
      {:else if p.type.kind === 'reference'}
        <select class="prop-concept" value={p.type.concept} disabled={readOnly} aria-label="Referenced concept" onchange={(e) => onChange(setPropertyType(game, p.id, { kind: 'reference', concept: e.currentTarget.value }))}>
          {#each concepts as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
        </select>
      {:else if p.type.kind === 'image' && ownedByConcept}
        <select class="prop-varies-by" value={p.type.variesBy ?? ''} disabled={readOnly} aria-label="Varies by" onchange={(e) => onChange(setImageVariesBy(game, p.id, e.currentTarget.value || null))}>
          <option value="">(does not vary)</option>
          {#each concepts.filter((c) => c.id !== owner) as c (c.id)}<option value={c.id}>varies by {c.name}</option>{/each}
        </select>
      {/if}
      <button type="button" class="remove" disabled={readOnly} onclick={() => onChange(removeProperty(game, p.id))}>Remove</button>
    </li>
  {/each}
</ul>
<AddForm kind="add-property" label="New property" disabled={readOnly} onAdd={(name) => onChange(addProperty(game, { id: newId(), name, owner }))} />
