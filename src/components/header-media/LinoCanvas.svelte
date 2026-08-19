<script lang="ts">
  // ─────────────────────────────────────────────────────────────────────────
  // YOUR SPACE. This island replaces the header <img> on the Lino Printing
  // card and nothing else — masthead, credits, body, gallery and card strips
  // all still come from GenericRenderer.
  //
  // Hooked up by `headerMedia: lino-canvas` in the card's frontmatter, via
  // HEADER_MEDIA_RENDERERS in src/lib/renderers.ts. Mounted client:load, so
  // the full Svelte 5 runes API is available ($state / $derived / $effect).
  //
  // Two house rules that bite here specifically:
  //  - No hex literals. Colours come from the CSS custom properties in
  //    global.css (--color-bg, --color-text, --dither-N, …). An `opacity` used
  //    to soften a colour is a bug — the palette has no grey.
  //  - Do NOT put `transform`, `filter`, `will-change: transform`, `contain:
  //    paint` or `perspective` on an ancestor of anything dithered. It
  //    re-anchors the fixed dither grid and makes it shimmer. Transforming
  //    *inside* this component is fine as long as nothing dithered is under it
  //    — an undithered pan/zoom canvas is exactly that case.
  // ─────────────────────────────────────────────────────────────────────────
  import type { HeaderMediaProps } from '../../lib/header-media';

  // `images` is every colocated image in the card folder, filename-sorted,
  // already run through astro:assets — src is the optimised URL, width/height
  // are its intrinsic dimensions. `entryId` is the card uid.
  const { entryId, images }: HeaderMediaProps = $props();

  const exitLocations = [
    [-0.25, -0.5],
    [0.25, -0.5],
    [0.5, -0.25],
    [0.5, 0.25],
    [0.25, 0.5],
    [-0.25, 0.5],
    [-0.5, 0.25],
    [-0.5, -0.25]
  ];

  const allImages = [
    {
      ...images[0],
      exits: [1, 5, 6, 7]
    },
    {
      ...images[1],
      exits: [1, 3, 5]
    },
    {
      ...images[2],
      exits: [1, 3, 5, 7]
    },
    {
      ...images[3],
      exits: [0, 1, 2, 4, 5, 6]
    },
    {
      ...images[4],
      exits: [0, 1, 3, 4, 5, 6]
    }
  ];

  // Positions are in TILE UNITS, not pixels — [1, 0] is one tile to the east.
  // CSS turns a unit into a length via --lino-step, so the whole layout scales
  // with --lino-tile and nothing here needs to know the viewport size.
  const placedImages = $state([{
    ...allImages[0],
    position: [0,0]
  }]);

  // Wiggle offset as a FRACTION of the container (-0.5 … 0.5). The amplitude
  // lives in CSS (--lino-wiggle) so it scales with the tile too.
  let dM = $state({ x: 0, y: 0 })

  let wiggleEl: HTMLDivElement;

  function handleMouseMove(event: MouseEvent) {
    const r = wiggleEl.getBoundingClientRect();
    dM.x = -((event.clientX - r.left)/r.width - 0.5);
    dM.y = -((event.clientY - r.top)/r.height - 0.5);
  }

</script>

<div class="container"
    bind:this={wiggleEl}
    onmousemove={handleMouseMove}
    role="img">
    <div class="lino-wiggle"
        style:--dx={dM.x}
        style:--dy={dM.y}>
        <div class="lino-canvas" data-entry={entryId}>
        {#each placedImages as image (image.filename)}
            <div class="image-container"
                style:--col={image.position[0]}
                style:--row={image.position[1]}>
                    {#each image.exits as exit}
                        <div class="exit"
                            style:--exit-x={exitLocations[exit][0]}
                            style:--exit-y={exitLocations[exit][1]}
                        ></div>
                    {/each}
                    <img
                        src={image.src}
                        width={image.width}
                        height={image.height}
                        alt=""
                        loading="lazy"
                        />
            </div>
        {/each}
        </div>
    </div>
</div>

<style>
  /* ── The one place a size is decided ──────────────────────────────────────
     --lino-tile is the suggestion: 500px unless the viewport can't afford it.
     vmin (not vw) because the tiles are square — a short landscape phone would
     otherwise get tiles taller than the screen. Everything else is expressed
     as a ratio of the tile, so the whole composition scales as one thing.     */
  .container {
      --lino-tile: clamp(180px, 80vmin, 500px);

      --lino-gap: 0px;                                  /* between tiles */
      --lino-step: calc(var(--lino-tile) + var(--lino-gap));

      --lino-frame: calc(var(--lino-tile) / 10);        /* was 20px @ 500 */
      --lino-wiggle: var(--lino-frame);                 /* travel, peak-to-peak */
      --lino-exit-size: calc(var(--lino-tile) / 20);    /* was 20px @ 500 */
      --lino-exit-ring: calc(var(--lino-exit-size) / 5); /* each stripe */
      --lino-shadow: calc(var(--lino-tile) / 100);      /* tile lift */

      overflow: hidden;
  }

  .lino-wiggle {
      position: relative;
      transform: translate(
          calc(var(--dx, 0) * var(--lino-wiggle)),
          calc(var(--dy, 0) * var(--lino-wiggle))
      );
  }

  .lino-canvas {
    position: relative;
    background: var(--color-bg);
    height: calc(var(--lino-tile) + var(--lino-frame));
    transform: translate(50%, 50%)
  }

  .lino-canvas .image-container {
      position: absolute;
      left: calc(var(--col, 0) * var(--lino-step) - var(--lino-tile) / 2);
      top: calc(var(--row, 0) * var(--lino-step) - var(--lino-tile) / 2);
  }

  .image-container img {
      width: var(--lino-tile);
      height: var(--lino-tile);
  }

  /* --exit-x/--exit-y are fractions of the tile (-0.5 … 0.5) from its centre,
     so an exit stays welded to its edge at every size. */
  .exit {
      position: absolute;
      width: var(--lino-exit-size);
      height: var(--lino-exit-size);
      left: calc(var(--exit-x) * var(--lino-tile) + var(--lino-tile) / 2 - var(--lino-exit-size) / 2);
      top: calc(var(--exit-y) * var(--lino-tile) + var(--lino-tile) / 2 - var(--lino-exit-size) / 2);
      background: var(--color-text);
      border-radius: 50%;
      z-index: -1;

      /* Striped: ink dot, paper ring, ink ring. Two spread-only box-shadows
         rather than border + outline — a border would eat into the dot's own
         box, and both stripes need to follow the border-radius and the hover
         scale. Painted back-to-front, so the second shadow shows only where
         the first doesn't cover it. Both stripes flip with the theme for free:
         the tokens are the same two colours the rest of the site swaps. */
      box-shadow:
          0 0 0 var(--lino-exit-ring) var(--color-bg),
          0 0 0 calc(var(--lino-exit-ring) * 2) var(--color-text);


      &:hover {
          transform: scale(110%);
      }
  }
</style>
