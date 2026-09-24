<!--
  An invisible, hit-testable copy of some shapes inside a <DitherSvg>.

  The shapes a <DitherLayer> draws live in a mask, and mask contents are never
  hit-tested. This renders its children into a real <svg> on top, with the
  same paint defaults, opacity 0, so event handlers on them fire. Use it via
  `<DitherLayer interactive>` to make visible shapes clickable, or on its own
  for hit areas with no visible counterpart.

  Only painted shapes catch the pointer; the svg itself lets events through to
  whatever is beneath.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { getDitherSvgContext } from './context';

  type Props = { children: Snippet };
  const { children }: Props = $props();

  const ctx = getDitherSvgContext();
</script>

<svg class="hit" viewBox={ctx.viewBox} aria-hidden="true">
  <g fill="#fff" stroke="#fff" stroke-width="0">
    {@render children()}
  </g>
</svg>

<style>
  /* Invisible (opacity keeps hit testing; visibility would not).

     A touch on a hit shape belongs to the shape, not the page: no panning,
     no long-press selection or callout. Touches that land on no shape pass
     through the svg (pointer-events: none) and scroll as normal. */
  .hit {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    pointer-events: none;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  .hit > g {
    pointer-events: visiblePainted;
  }
</style>
