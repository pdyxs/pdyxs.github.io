<script lang="ts">
  import type { ComponentSet, Game } from '../model/types.ts';
  import { addComponent, addSet, removeSet, renameSet, setSubstitute } from '../model/ops.ts';
  import { expand } from '../model/expand.ts';
  import { routeHash } from './route.ts';
  import { newId } from './ids.ts';
  import AddForm from './AddForm.svelte';
  import PropertyList from './PropertyList.svelte';
  import ComponentRow from './ComponentRow.svelte';

  let { game, set, readOnly, onChange }: { game: Game; set: ComponentSet; readOnly: boolean; onChange: (next: Game) => void } = $props();

  // expand is the one place instances are computed; the page only counts them.
  const total = $derived(expand(game, set.id).length);
</script>

<h2>Component set</h2>
<label>
  Name
  <input class="set-name" type="text" value={set.name} disabled={readOnly} oninput={(e) => onChange(renameSet(game, set.id, e.currentTarget.value))} />
</label>
<label>
  Substitute description
  <textarea class="set-substitute" value={set.substitute} disabled={readOnly} oninput={(e) => onChange(setSubstitute(game, set.id, e.currentTarget.value))}></textarea>
</label>

<h3>Properties</h3>
<PropertyList {game} owner={set.id} properties={set.properties} {readOnly} {onChange} />

<h3>Components</h3>
<p class="instance-total">Total instances: {total}</p>
<ul class="components">
  {#each set.components as component (component.id)}
    <ComponentRow {game} {set} {component} {readOnly} {onChange} />
  {/each}
</ul>
<AddForm kind="add-component" label="New component" disabled={readOnly} onAdd={(name) => onChange(addComponent(game, { set: set.id, id: newId(), name }))} />

<h3>Nested sets</h3>
<ul class="children">
  {#each set.children as child (child.id)}
    <li class="child-set-row">
      <a class="set-link" href={routeHash({ page: 'set', set: child.id })}>{child.name}</a>
      <button type="button" class="remove" disabled={readOnly} onclick={() => onChange(removeSet(game, child.id))}>Remove</button>
    </li>
  {/each}
</ul>
<AddForm kind="add-child-set" label="New nested set" disabled={readOnly} onAdd={(name) => onChange(addSet(game, { id: newId(), name, parent: set.id }))} />
