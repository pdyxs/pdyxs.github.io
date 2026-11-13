<script lang="ts">
  import type { Concept, Game } from '../model/types.ts';
  import { addConcept, addEntity, removeConcept, removeEntity, renameConcept } from '../model/ops.ts';
  import { routeHash } from './route.ts';
  import { newId } from './ids.ts';
  import AddForm from './AddForm.svelte';
  import PropertyList from './PropertyList.svelte';

  let { game, concept, readOnly, onChange }: { game: Game; concept: Concept; readOnly: boolean; onChange: (next: Game) => void } = $props();
</script>

<h2>Concept</h2>
<label>
  Name
  <input class="concept-name" type="text" value={concept.name} disabled={readOnly} oninput={(e) => onChange(renameConcept(game, concept.id, e.currentTarget.value))} />
</label>

<h3>Properties</h3>
<PropertyList {game} owner={concept.id} properties={concept.properties} {readOnly} {onChange} />

<h3>Nested concepts</h3>
<ul class="children">
  {#each concept.children as child (child.id)}
    <li class="child-row">
      <a class="concept-link" href={routeHash({ page: 'concept', concept: child.id })}>{child.name}</a>
      <button type="button" class="remove" disabled={readOnly} onclick={() => onChange(removeConcept(game, child.id))}>Remove</button>
    </li>
  {/each}
</ul>
<AddForm kind="add-child" label="New nested concept" disabled={readOnly} onAdd={(name) => onChange(addConcept(game, { id: newId(), name, parent: concept.id }))} />

<h3>Entities</h3>
<ul class="entities">
  {#each concept.entities as entity (entity.id)}
    <li class="entity-row">
      <a class="entity-link" href={routeHash({ page: 'entity', concept: concept.id, entity: entity.id })}>{entity.name}</a>
      <button type="button" class="remove" disabled={readOnly} onclick={() => onChange(removeEntity(game, entity.id))}>Remove</button>
    </li>
  {/each}
</ul>
<AddForm kind="add-entity" label="New entity" disabled={readOnly} onAdd={(name) => onChange(addEntity(game, { concept: concept.id, id: newId(), name }))} />
