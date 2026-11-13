<script lang="ts">
  // One layer's fields. Which fields show depends on the layer type; every edit
  // is an op on the whole game. Selection is the caller's: this only reports a
  // click or focus and draws the highlight it is told to, never storing either.
  import type { Binding, Game, ImageFit, Layer, Prop, TextAlign } from '../model/types.ts';
  import { bindLayerProp, moveLayer, removeLayer, setLayerBox, setLayerProp, setShapeKind, unbindLayerProp } from '../model/ops.ts';
  import { LAYER_PROPS } from '../model/bindings.ts';
  import ImageSlot from './ImageSlot.svelte';
  import PropBinding from './PropBinding.svelte';

  let { game, setId, layer, selected, readOnly, onChange, onSelect, editorId, dir }: {
    game: Game; setId: string; layer: Layer; selected: boolean; readOnly: boolean; onChange: (next: Game) => void; onSelect: (layerId: string) => void; editorId: string; dir: string;
  } = $props();

  const num = (e: Event & { currentTarget: HTMLInputElement }) => parseFloat(e.currentTarget.value);
  const prop = (key: string, value: unknown) => onChange(setLayerProp(game, layer.id, key, value));
  const bind = (key: string, binding: Binding | null) => onChange(binding ? bindLayerProp(game, layer.id, key, binding) : unbindLayerProp(game, layer.id, key));
  const specs = $derived(LAYER_PROPS[layer.type]);
</script>

{#snippet binder(key: string, p: Prop<unknown>)}
  <PropBinding {game} {setId} spec={specs[key]} prop={p} {readOnly} onBind={(b) => bind(key, b)} />
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events -->
<li class="layer-row" class:selected onclick={() => onSelect(layer.id)} onfocusin={() => onSelect(layer.id)}>
  <span class="layer-type">{layer.type}</span>
  <button type="button" class="layer-up" disabled={readOnly} aria-label="Move layer toward the back" onclick={() => onChange(moveLayer(game, layer.id, -1))}>Up</button>
  <button type="button" class="layer-down" disabled={readOnly} aria-label="Move layer toward the front" onclick={() => onChange(moveLayer(game, layer.id, 1))}>Down</button>
  <button type="button" class="remove-layer" disabled={readOnly} onclick={() => onChange(removeLayer(game, layer.id))}>Remove</button>
  <label>x <input class="layer-x" type="number" step="any" value={layer.x} disabled={readOnly} oninput={(e) => onChange(setLayerBox(game, layer.id, { x: num(e) }))} /></label>
  <label>y <input class="layer-y" type="number" step="any" value={layer.y} disabled={readOnly} oninput={(e) => onChange(setLayerBox(game, layer.id, { y: num(e) }))} /></label>
  <label>width <input class="layer-width" type="number" step="any" min="0" value={layer.width} disabled={readOnly} oninput={(e) => onChange(setLayerBox(game, layer.id, { width: num(e) }))} /></label>
  <label>height <input class="layer-height" type="number" step="any" min="0" value={layer.height} disabled={readOnly} oninput={(e) => onChange(setLayerBox(game, layer.id, { height: num(e) }))} /></label>
  {#if layer.type === 'text'}
    <span class="layer-prop layer-prop-text">
      {#if layer.text.kind === 'literal'}<label>text <input class="layer-text" type="text" value={layer.text.value} disabled={readOnly} oninput={(e) => prop('text', e.currentTarget.value)} /></label>{:else}text{/if}
      {@render binder('text', layer.text)}
    </span>
    <span class="layer-prop layer-prop-size">
      {#if layer.size.kind === 'literal'}{@const size = layer.size.value}<label>size <input class="layer-size" type="number" step="any" min="0" value={size} disabled={readOnly} oninput={(e) => prop('size', num(e) > 0 ? num(e) : size)} /></label>{:else}size{/if}
      {@render binder('size', layer.size)}
    </span>
    <span class="layer-prop layer-prop-colour">
      {#if layer.colour.kind === 'literal'}<label>colour <input class="layer-colour" type="color" value={layer.colour.value} disabled={readOnly} oninput={(e) => prop('colour', e.currentTarget.value)} /></label>{:else}colour{/if}
      {@render binder('colour', layer.colour)}
    </span>
    <span class="layer-prop layer-prop-align">
      {#if layer.align.kind === 'literal'}
        <label>align
          <select class="layer-align" value={layer.align.value} disabled={readOnly} onchange={(e) => prop('align', e.currentTarget.value as TextAlign)}>
            <option value="left">left</option><option value="center">center</option><option value="right">right</option>
          </select>
        </label>
      {:else}align{/if}
      {@render binder('align', layer.align)}
    </span>
  {:else if layer.type === 'image'}
    <span class="layer-prop layer-prop-file">
      {#if layer.file.kind === 'literal'}<ImageSlot {editorId} {dir} file={layer.file.value} label="Layer image" {readOnly} onPick={(file) => prop('file', file)} />{:else}image{/if}
      {@render binder('file', layer.file)}
    </span>
    <span class="layer-prop layer-prop-fit">
      {#if layer.fit.kind === 'literal'}
        <label>fit
          <select class="layer-fit" value={layer.fit.value} disabled={readOnly} onchange={(e) => prop('fit', e.currentTarget.value as ImageFit)}>
            <option value="cover">cover</option><option value="contain">contain</option><option value="stretch">stretch</option>
          </select>
        </label>
      {:else}fit{/if}
      {@render binder('fit', layer.fit)}
    </span>
  {:else}
    <label>shape
      <select class="layer-shape" value={layer.shape} disabled={readOnly} onchange={(e) => onChange(setShapeKind(game, layer.id, e.currentTarget.value as 'rect' | 'ellipse'))}>
        <option value="rect">rectangle</option><option value="ellipse">ellipse</option>
      </select>
    </label>
    <span class="layer-prop layer-prop-fill">
      {#if layer.fill.kind === 'literal'}<label>fill <input class="layer-fill" type="text" value={layer.fill.value ?? ''} disabled={readOnly} oninput={(e) => prop('fill', e.currentTarget.value || null)} /></label>{:else}fill{/if}
      {@render binder('fill', layer.fill)}
    </span>
    <span class="layer-prop layer-prop-stroke">
      {#if layer.stroke.kind === 'literal'}<label>stroke <input class="layer-stroke" type="text" value={layer.stroke.value ?? ''} disabled={readOnly} oninput={(e) => prop('stroke', e.currentTarget.value || null)} /></label>{:else}stroke{/if}
      {@render binder('stroke', layer.stroke)}
    </span>
    <span class="layer-prop layer-prop-strokeWidth">
      {#if layer.strokeWidth.kind === 'literal'}<label>stroke width <input class="layer-stroke-width" type="number" step="any" min="0" value={layer.strokeWidth.value} disabled={readOnly} oninput={(e) => prop('strokeWidth', Math.max(0, num(e) || 0))} /></label>{:else}stroke width{/if}
      {@render binder('strokeWidth', layer.strokeWidth)}
    </span>
  {/if}
</li>
