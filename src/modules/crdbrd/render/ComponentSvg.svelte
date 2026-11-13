<script lang="ts">
  // The only view of a Scene: draws it as SVG with a viewBox in mm, so display
  // size is just CSS. No decisions here; the scene arrives resolved.
  import type { Scene } from './resolve.ts';

  let { scene, imageUrl, maskId = 'crdbrd-bleed-mask' }: { scene: Scene; imageUrl: (file: string) => string; maskId?: string } = $props();

  // The SVG attribute each fit name stands for; a lookup, not a decision.
  const fitToAspect = { contain: 'xMidYMid meet', cover: 'xMidYMid slice', stretch: 'none' } as const;
</script>

<svg class="component-svg" viewBox="{scene.page.x} {scene.page.y} {scene.page.width} {scene.page.height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <mask id={maskId} maskUnits="userSpaceOnUse" x={scene.page.x} y={scene.page.y} width={scene.page.width} height={scene.page.height}>
      <path d={scene.bleedMask.path} fill="#fff" stroke="#fff" stroke-width={scene.bleedMask.strokeWidth} stroke-linejoin={scene.bleedMask.lineJoin} />
    </mask>
  </defs>
  <rect class="bleed-area" x={scene.page.x} y={scene.page.y} width={scene.page.width} height={scene.page.height} fill="#fdd" />
  <path class="card-face" d={scene.cutPath} fill="#fff" />
  <g class="items" mask="url(#{maskId})">
    {#each scene.items as item (item.id)}
      {#if item.kind === 'shape'}
        {#if item.shape === 'rect'}
          <rect x={item.x} y={item.y} width={item.width} height={item.height} fill={item.fill ?? 'none'} stroke={item.stroke ?? 'none'} stroke-width={item.strokeWidth} />
        {:else}
          <ellipse cx={item.x + item.width / 2} cy={item.y + item.height / 2} rx={item.width / 2} ry={item.height / 2} fill={item.fill ?? 'none'} stroke={item.stroke ?? 'none'} stroke-width={item.strokeWidth} />
        {/if}
      {:else if item.kind === 'image'}
        <image href={imageUrl(item.file)} x={item.x} y={item.y} width={item.width} height={item.height} preserveAspectRatio={fitToAspect[item.fit]} />
      {:else if item.kind === 'gap'}
        <g class="gap">
          <title>{item.reason}</title>
          <rect x={item.x} y={item.y} width={item.width} height={item.height} fill="#eee" stroke="#999" stroke-width="0.3" stroke-dasharray="1 1" />
          <line x1={item.x} y1={item.y} x2={item.x + item.width} y2={item.y + item.height} stroke="#999" stroke-width="0.3" />
          <line x1={item.x + item.width} y1={item.y} x2={item.x} y2={item.y + item.height} stroke="#999" stroke-width="0.3" />
        </g>
      {:else if item.kind === 'text'}
        <text font-size={item.size} fill={item.colour} text-anchor={item.anchor} font-family="sans-serif">
          {#each item.lines as line, i (i)}<tspan x={line.x} y={line.y}>{line.text}</tspan>{/each}
        </text>
      {/if}
    {/each}
  </g>
  <path class="cut-line" d={scene.cutPath} fill="none" stroke="#e00" stroke-width="0.2" stroke-dasharray="1 0.6" />
</svg>
