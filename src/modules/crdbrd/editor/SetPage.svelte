<script lang="ts">
  import type { ComponentSet, Game } from '../model/types.ts';
  import { addComponent, addLayer, addSet, removeSet, renameSet, setOutlineRadius, setSetBleed, setSetSize, setSubstitute } from '../model/ops.ts';
  import { expand } from '../model/expand.ts';
  import { geometryOf, templateOf } from '../model/query.ts';
  import type { LayerType } from '../model/types.ts';
  import { routeHash } from './route.ts';
  import { newId } from './ids.ts';
  import AddForm from './AddForm.svelte';
  import PropertyList from './PropertyList.svelte';
  import ComponentRow from './ComponentRow.svelte';
  import LayerRow from './LayerRow.svelte';
  import SetPreview from './SetPreview.svelte';

  let { game, set, readOnly, onChange, editorId, dir }: { game: Game; set: ComponentSet; readOnly: boolean; onChange: (next: Game) => void; editorId: string; dir: string } = $props();

  // expand is the one place instances are computed; the page only counts them.
  const total = $derived(expand(game, set.id).length);
  const geometry = $derived(geometryOf(set));
  const layers = $derived(templateOf(set));
  let newLayerType = $state<LayerType>('shape');
  const num = (e: Event & { currentTarget: HTMLInputElement }) => parseFloat(e.currentTarget.value);
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

<h3>Design</h3>
<div class="set-geometry">
  <label>Width (mm) <input class="set-width" type="number" step="any" min="0" value={geometry.size.width} disabled={readOnly} oninput={(e) => onChange(setSetSize(game, set.id, { ...geometry.size, width: num(e) }))} /></label>
  <label>Height (mm) <input class="set-height" type="number" step="any" min="0" value={geometry.size.height} disabled={readOnly} oninput={(e) => onChange(setSetSize(game, set.id, { ...geometry.size, height: num(e) }))} /></label>
  <label>Bleed (mm) <input class="set-bleed" type="number" step="any" min="0" value={geometry.bleed} disabled={readOnly} oninput={(e) => onChange(setSetBleed(game, set.id, num(e)))} /></label>
  <label>Corner radius (mm) <input class="set-radius" type="number" step="any" min="0" value={geometry.outline.radius ?? 0} disabled={readOnly} oninput={(e) => onChange(setOutlineRadius(game, set.id, num(e)))} /></label>
</div>
<div class="set-design">
  <div class="layers">
    <ul class="layer-list">
      {#each layers as layer (layer.id)}
        <LayerRow {game} {layer} {readOnly} {onChange} {editorId} {dir} />
      {/each}
    </ul>
    <select class="add-layer-type" value={newLayerType} onchange={(e) => (newLayerType = e.currentTarget.value as LayerType)} disabled={readOnly} aria-label="Layer type">
      <option value="shape">shape</option><option value="text">text</option><option value="image">image</option>
    </select>
    <button type="button" class="add-layer" disabled={readOnly} onclick={() => onChange(addLayer(game, { set: set.id, id: newId(), type: newLayerType }))}>Add layer</button>
  </div>
  <SetPreview {game} {set} {editorId} {dir} />
</div>

<h3>Properties</h3>
<PropertyList {game} owner={set.id} properties={set.properties} {readOnly} {onChange} />

<h3>Components</h3>
<p class="instance-total">Total instances: {total}</p>
<ul class="components">
  {#each set.components as component (component.id)}
    <ComponentRow {game} {set} {component} {readOnly} {onChange} {editorId} {dir} />
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
