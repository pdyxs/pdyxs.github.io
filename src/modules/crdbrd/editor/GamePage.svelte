<script lang="ts">
  import type { Game } from '../model/types.ts';
  import { addConcept, addSet, removeSet, removeConcept, renameGame, setGameValue } from '../model/ops.ts';
  import { setsOf } from '../model/query.ts';
  import { routeHash } from './route.ts';
  import { newId } from './ids.ts';
  import AddForm from './AddForm.svelte';
  import PropertyList from './PropertyList.svelte';
  import ValueRows from './ValueRows.svelte';

  let { game, readOnly, onChange }: { game: Game; readOnly: boolean; onChange: (next: Game) => void } = $props();
</script>

<h2>Game</h2>
<label>
  Name
  <input class="game-name" type="text" value={game.name} disabled={readOnly} oninput={(e) => onChange(renameGame(game, e.currentTarget.value))} />
</label>

<h3>Concepts</h3>
<ul class="concepts">
  {#each game.concepts as concept (concept.id)}
    <li class="concept-row">
      <a class="concept-link" href={routeHash({ page: 'concept', concept: concept.id })}>{concept.name}</a>
      <button type="button" class="remove" disabled={readOnly} onclick={() => onChange(removeConcept(game, concept.id))}>Remove</button>
    </li>
  {/each}
</ul>
<AddForm kind="add-concept" label="New concept" disabled={readOnly} onAdd={(name) => onChange(addConcept(game, { id: newId(), name }))} />

<h3>Component sets</h3>
<ul class="sets">
  {#each setsOf(game) as set (set.id)}
    <li class="set-row">
      <a class="set-link" href={routeHash({ page: 'set', set: set.id })}>{set.name}</a>
      <button type="button" class="remove" disabled={readOnly} onclick={() => onChange(removeSet(game, set.id))}>Remove</button>
    </li>
  {/each}
</ul>
<AddForm kind="add-set" label="New component set" disabled={readOnly} onAdd={(name) => onChange(addSet(game, { id: newId(), name }))} />

<h3>Properties</h3>
<PropertyList {game} properties={game.properties} {readOnly} {onChange} />

<h3>Values</h3>
<div class="game-values">
  <ValueRows {game} properties={game.properties} owner={game} {readOnly} onSet={(p, v) => onChange(setGameValue(game, p, v))} />
</div>
