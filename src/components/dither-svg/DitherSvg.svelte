<!--
  A square drawing surface whose fills are dither levels.

  SVG `fill` can't take a `--dither-N` token (they are background-image stacks,
  not <paint>), and a viewBox-scaled fill would scale the 4px dot grid anyway
  (docs/agents/styling.md). So each <DitherLayer> is an HTML div painted with
  its dither level and masked by the shapes it wraps, drawn in this viewBox's
  coordinates. This component owns the box and the viewBox→px transform; the
  layers read it from context.

  Shapes are inert by default (they live in a mask). `<DitherLayer interactive>`
  renders its children a second time into a <HitLayer>, an invisible overlay
  <svg> that takes the hits, so `onclick` / `onpointerdown` on a child just
  work; a bare <HitLayer> gives hit areas with nothing visible behind them.

    <DitherSvg viewBox="-5 -5 10 10">
      <DitherLayer level={4}><circle r="0.2" /></DitherLayer>
    </DitherSvg>
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { setDitherSvgContext } from './context';

  type Props = {
    /** As on <svg>: "minX minY width height". Width and height must match. */
    viewBox: string;
    children: Snippet;
  };
  const { viewBox, children }: Props = $props();

  const view = $derived.by(() => {
    const [x, y, size] = viewBox.split(/[\s,]+/).map(Number);
    return { x, y, size };
  });

  let width = $state(0);
  const transform = $derived(
    `scale(${width / view.size}) translate(${-view.x} ${-view.y})`
  );

  setDitherSvgContext({
    get viewBox() { return viewBox; },
    get width() { return width; },
    get transform() { return transform; },
  });
</script>

<div class="dither-svg" bind:clientWidth={width}>
  {@render children()}
</div>

<style>
  .dither-svg {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
  }
</style>
