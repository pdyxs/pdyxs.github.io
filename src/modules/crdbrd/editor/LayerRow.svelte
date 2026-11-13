<script lang="ts">
  // One layer's fields. Which fields show depends on the layer type; every edit
  // is an op on the whole game. Selection and the like would live here, never in the layer.
  import type { Game, ImageFit, Layer, TextAlign } from '../model/types.ts';
  import { moveLayer, removeLayer, setLayerBox, setLayerProp, setShapeKind } from '../model/ops.ts';
  import ImageSlot from './ImageSlot.svelte';

  let { game, layer, readOnly, onChange, editorId, dir }: {
    game: Game; layer: Layer; readOnly: boolean; onChange: (next: Game) => void; editorId: string; dir: string;
  } = $props();

  const num = (e: Event & { currentTarget: HTMLInputElement }) => parseFloat(e.currentTarget.value);
  const prop = (key: string, value: unknown) => onChange(setLayerProp(game, layer.id, key, value));
</script>

<li class="layer-row">
  <span class="layer-type">{layer.type}</span>
  <button type="button" class="layer-up" disabled={readOnly} aria-label="Move layer toward the back" onclick={() => onChange(moveLayer(game, layer.id, -1))}>Up</button>
  <button type="button" class="layer-down" disabled={readOnly} aria-label="Move layer toward the front" onclick={() => onChange(moveLayer(game, layer.id, 1))}>Down</button>
  <button type="button" class="remove-layer" disabled={readOnly} onclick={() => onChange(removeLayer(game, layer.id))}>Remove</button>
  <label>x <input class="layer-x" type="number" step="any" value={layer.x} disabled={readOnly} oninput={(e) => onChange(setLayerBox(game, layer.id, { x: num(e) }))} /></label>
  <label>y <input class="layer-y" type="number" step="any" value={layer.y} disabled={readOnly} oninput={(e) => onChange(setLayerBox(game, layer.id, { y: num(e) }))} /></label>
  <label>width <input class="layer-width" type="number" step="any" min="0" value={layer.width} disabled={readOnly} oninput={(e) => onChange(setLayerBox(game, layer.id, { width: num(e) }))} /></label>
  <label>height <input class="layer-height" type="number" step="any" min="0" value={layer.height} disabled={readOnly} oninput={(e) => onChange(setLayerBox(game, layer.id, { height: num(e) }))} /></label>
  {#if layer.type === 'text'}
    <label>text <input class="layer-text" type="text" value={layer.text.value} disabled={readOnly} oninput={(e) => prop('text', e.currentTarget.value)} /></label>
    <label>size <input class="layer-size" type="number" step="any" min="0" value={layer.size.value} disabled={readOnly} oninput={(e) => prop('size', num(e) > 0 ? num(e) : layer.size.value)} /></label>
    <label>colour <input class="layer-colour" type="color" value={layer.colour.value} disabled={readOnly} oninput={(e) => prop('colour', e.currentTarget.value)} /></label>
    <label>align
      <select class="layer-align" value={layer.align.value} disabled={readOnly} onchange={(e) => prop('align', e.currentTarget.value as TextAlign)}>
        <option value="left">left</option><option value="center">center</option><option value="right">right</option>
      </select>
    </label>
  {:else if layer.type === 'image'}
    <ImageSlot {editorId} {dir} file={layer.file.value} label="Layer image" {readOnly} onPick={(file) => prop('file', file)} />
    <label>fit
      <select class="layer-fit" value={layer.fit.value} disabled={readOnly} onchange={(e) => prop('fit', e.currentTarget.value as ImageFit)}>
        <option value="cover">cover</option><option value="contain">contain</option><option value="stretch">stretch</option>
      </select>
    </label>
  {:else}
    <label>shape
      <select class="layer-shape" value={layer.shape} disabled={readOnly} onchange={(e) => onChange(setShapeKind(game, layer.id, e.currentTarget.value as 'rect' | 'ellipse'))}>
        <option value="rect">rectangle</option><option value="ellipse">ellipse</option>
      </select>
    </label>
    <label>fill <input class="layer-fill" type="text" value={layer.fill.value ?? ''} disabled={readOnly} oninput={(e) => prop('fill', e.currentTarget.value || null)} /></label>
    <label>stroke <input class="layer-stroke" type="text" value={layer.stroke.value ?? ''} disabled={readOnly} oninput={(e) => prop('stroke', e.currentTarget.value || null)} /></label>
    <label>stroke width <input class="layer-stroke-width" type="number" step="any" min="0" value={layer.strokeWidth.value} disabled={readOnly} oninput={(e) => prop('strokeWidth', Math.max(0, num(e) || 0))} /></label>
  {/if}
</li>
