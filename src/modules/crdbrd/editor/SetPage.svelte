<script lang="ts">
  import type { ComponentSet, Game, Outline } from '../model/types.ts';
  import { addComponent, addLayer, addSet, removeSet, renameSet, setOutline, setOutlineRadius, setSetBleed, setSetSize, setSubstitute } from '../model/ops.ts';
  import { expand } from '../model/expand.ts';
  import { geometryOf, templateOf } from '../model/query.ts';
  import { outlineProblem } from '../model/path.ts';
  import { outline as cutOutline } from '../render/outline.ts';
  import type { LayerType } from '../model/types.ts';
  import { routeHash } from './route.ts';
  import { newId } from './ids.ts';
  import AddForm from './AddForm.svelte';
  import PropertyList from './PropertyList.svelte';
  import ComponentRow from './ComponentRow.svelte';
  import LayerRow from './LayerRow.svelte';
  import SetPreview from './SetPreview.svelte';
  import { instanceLabel } from './instance-label.ts';

  let { game, set, readOnly, onChange, editorId, dir }: { game: Game; set: ComponentSet; readOnly: boolean; onChange: (next: Game) => void; editorId: string; dir: string } = $props();

  // expand is the one place instances are computed; the page only counts them.
  const instances = $derived(expand(game, set.id));
  const total = $derived(instances.length);
  // Where you are in the design, not part of the game: which piece the preview shows and which layer is selected.
  let instanceIndex = $state(0);
  let selectedLayer = $state<string | null>(null);
  const instance = $derived(instances[Math.min(instanceIndex, instances.length - 1)]);
  const geometry = $derived(geometryOf(set));
  const layers = $derived(templateOf(set));
  let newLayerType = $state<LayerType>('shape');
  const outline = $derived(geometry.outline);
  const pathProblem = $derived(outlineProblem(outline) === 'path');
  // The starting point for each kind; a custom path starts as the current cut line, which is valid.
  const startOutline = (kind: Outline['kind']): Outline => {
    switch (kind) {
      case 'circle': return { kind };
      case 'hexagon': return { kind, orientation: 'pointy', measure: 'flat-to-flat' };
      case 'custom': return { kind, path: cutOutline(set).cutPath };
      default: return { kind: 'rectangle' };
    }
  };
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
  <label>Shape
    <select class="set-outline-kind" value={outline.kind} disabled={readOnly} onchange={(e) => onChange(setOutline(game, set.id, startOutline(e.currentTarget.value as Outline['kind'])))}>
      <option value="rectangle">rectangle</option><option value="circle">circle</option><option value="hexagon">hexagon</option><option value="custom">custom path</option>
    </select>
  </label>
  {#if outline.kind === 'hexagon'}
    <label>Orientation
      <select class="hex-orientation" value={outline.orientation} disabled={readOnly} onchange={(e) => onChange(setOutline(game, set.id, { ...outline, orientation: e.currentTarget.value as 'pointy' | 'flat' }))}>
        <option value="pointy">pointy top</option><option value="flat">flat top</option>
      </select>
    </label>
    <label>Width means
      <select class="hex-measure" value={outline.measure} disabled={readOnly} onchange={(e) => onChange(setOutline(game, set.id, { ...outline, measure: e.currentTarget.value as 'flat-to-flat' | 'point-to-point' }))}>
        <option value="flat-to-flat">flat-to-flat</option><option value="point-to-point">point-to-point</option>
      </select>
    </label>
    <p class="set-measure-note">The width below is the {outline.measure} distance; the hexagon is regular, so the other side follows.</p>
  {/if}
  <label>{outline.kind === 'circle' ? 'Diameter' : outline.kind === 'hexagon' ? `Width, ${outline.measure}` : 'Width'} (mm) <input class="set-width" type="number" step="any" min="0" value={geometry.size.width} disabled={readOnly} oninput={(e) => onChange(setSetSize(game, set.id, { ...geometry.size, width: num(e) }))} /></label>
  {#if outline.kind === 'rectangle' || outline.kind === 'custom'}
    <label>Height (mm) <input class="set-height" type="number" step="any" min="0" value={geometry.size.height} disabled={readOnly} oninput={(e) => onChange(setSetSize(game, set.id, { ...geometry.size, height: num(e) }))} /></label>
  {/if}
  <label>Bleed (mm) <input class="set-bleed" type="number" step="any" min="0" value={geometry.bleed} disabled={readOnly} oninput={(e) => onChange(setSetBleed(game, set.id, num(e)))} /></label>
  {#if outline.kind === 'rectangle'}
    <label>Corner radius (mm) <input class="set-radius" type="number" step="any" min="0" value={outline.radius ?? 0} disabled={readOnly} oninput={(e) => onChange(setOutlineRadius(game, set.id, num(e)))} /></label>
  {/if}
  {#if outline.kind === 'custom'}
    <label>Path (SVG path data, mm, inside the width and height)
      <textarea class="set-path" value={outline.path} disabled={readOnly} oninput={(e) => onChange(setOutline(game, set.id, { kind: 'custom', path: e.currentTarget.value }))}></textarea>
    </label>
    {#if pathProblem}<p class="outline-error" role="alert">This path is not valid SVG path data; the preview shows a rectangle until it is fixed.</p>{/if}
  {/if}
</div>
<div class="set-design">
  <div class="layers">
    <ul class="layer-list">
      {#each layers as layer (layer.id)}
        <LayerRow {game} setId={set.id} {layer} selected={layer.id === selectedLayer} {readOnly} {onChange} onSelect={(id) => (selectedLayer = id)} {editorId} {dir} />
      {/each}
    </ul>
    <select class="add-layer-type" value={newLayerType} onchange={(e) => (newLayerType = e.currentTarget.value as LayerType)} disabled={readOnly} aria-label="Layer type">
      <option value="shape">shape</option><option value="text">text</option><option value="image">image</option>
    </select>
    <button type="button" class="add-layer" disabled={readOnly} onclick={() => onChange(addLayer(game, { set: set.id, id: newId(), type: newLayerType }))}>Add layer</button>
  </div>
  <div class="preview-pane">
    <select class="instance-picker" value={String(instance ? instances.indexOf(instance) : 0)} disabled={instances.length === 0} aria-label="Preview instance" onchange={(e) => (instanceIndex = parseInt(e.currentTarget.value, 10))}>
      {#each instances as inst, i (i)}<option value={String(i)}>{instanceLabel(game, inst)}</option>{/each}
    </select>
    <SetPreview {game} {set} {instance} highlight={selectedLayer} onSelect={(id) => (selectedLayer = id)} {editorId} {dir} />
  </div>
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
