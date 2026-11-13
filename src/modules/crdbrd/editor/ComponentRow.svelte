<script lang="ts">
  import type { Component, ComponentSet, Game } from '../model/types.ts';
  import { addPer, removeComponent, removePer, renameComponent, setComponentCount, setComponentValue } from '../model/ops.ts';
  import { allConcepts, findConcept } from '../model/query.ts';
  import ValueRows from './ValueRows.svelte';

  let { game, set, component, readOnly, onChange }: {
    game: Game; set: ComponentSet; component: Component; readOnly: boolean; onChange: (next: Game) => void;
  } = $props();

  const available = $derived(allConcepts(game).filter((c) => !component.per.includes(c.id)));
</script>

<li class="component-row">
  <input class="component-name" type="text" value={component.name} disabled={readOnly} aria-label="Component name" oninput={(e) => onChange(renameComponent(game, component.id, e.currentTarget.value))} />
  <input class="component-count" type="number" min="0" step="1" value={component.count} disabled={readOnly} aria-label="Count" oninput={(e) => onChange(setComponentCount(game, component.id, parseFloat(e.currentTarget.value)))} />
  <span class="per-label">per</span>
  {#each component.per as conceptId (conceptId)}
    <span class="per-chip">
      {findConcept(game, conceptId)?.name ?? conceptId}
      <button type="button" disabled={readOnly} onclick={() => onChange(removePer(game, component.id, conceptId))}>Remove</button>
    </span>
  {/each}
  <select class="add-per" value="" disabled={readOnly || available.length === 0} aria-label="Add per-concept" onchange={(e) => e.currentTarget.value && onChange(addPer(game, component.id, e.currentTarget.value))}>
    <option value="">(add per...)</option>
    {#each available as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
  </select>
  <button type="button" class="remove-component" disabled={readOnly} onclick={() => onChange(removeComponent(game, component.id))}>Remove</button>
  <ValueRows {game} properties={set.properties} owner={component} {readOnly} onSet={(p, v) => onChange(setComponentValue(game, component.id, p, v))} />
</li>
