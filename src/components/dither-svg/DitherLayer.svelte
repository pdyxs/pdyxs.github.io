<!--
  One dither level's worth of shapes inside a <DitherSvg>. The children are
  SVG elements in the parent's viewBox coordinates; they become a luminance
  mask (so fill *and* stroke count — paint them white, the default here) over
  a div carrying the dither.

  Mask contents are never hit-tested, so by default the shapes are inert. With
  `interactive`, the children are rendered a second time into a <HitLayer>,
  so what you can see is what you can click; event handlers on the children
  fire from that copy. (Because the snippet then renders twice, a `bind:this`
  inside it binds to the hit copy, and any `id` inside it would be
  duplicated.)
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { getDitherSvgContext } from './context';
  import HitLayer from './HitLayer.svelte';

  type Props = {
    /** 0–16, the --dither-N token to fill with. */
    level: number;
    /** Also render a hit-testable copy of the children. */
    interactive?: boolean;
    children: Snippet;
  };
  const { level, interactive = false, children }: Props = $props();

  const ctx = getDitherSvgContext();
  const maskId = $props.id();
</script>

<div class="layer" style:background="var(--dither-{level})" style:mask="url(#{maskId})"></div>

<svg class="mask-holder" width="0" height="0" aria-hidden="true">
  <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={ctx.width} height={ctx.width}>
    <g transform={ctx.transform} fill="#fff" stroke="#fff" stroke-width="0">
      {@render children()}
    </g>
  </mask>
</svg>

{#if interactive}
  <HitLayer>{@render children()}</HitLayer>
{/if}

<style>
  .layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  /* Referenced by id only; must not be display:none or the mask won't render. */
  .mask-holder {
    position: absolute;
  }
</style>
