<script lang="ts">
  // Draws a pre-laid-out graph. It does no layout and reads no content: the
  // positions arrive from the build (credits-layout.ts) and the camera maths is
  // credits-camera.ts. This owns selection, the fade classes and pan/zoom.
  import type { PositionedGraph } from '@content/credits/credits-layout';
  import { VIEW, connectedIds, frameSelection, type Camera } from './credits-camera';

  let { graph, selected = $bindable('card') }: { graph: PositionedGraph; selected?: string } = $props();

  let svg: SVGSVGElement;
  let cam = $state<Camera>({ cx: 0, cy: 0, s: 1 });
  let live = $state(false); // a drag, pinch or wheel in progress: follow the pointer, no easing

  // Re-aim on every selection change (and once on mount, when the width is known).
  $effect(() => {
    const phone = svg.clientWidth > 0 && svg.clientWidth < 600;
    cam = frameSelection(graph, selected, { phone });
  });

  const at = (id: string) => graph.nodes.find(n => n.id === id)!;
  const lit = $derived(connectedIds(graph, selected));
  const edgeLit = (from: string, to: string) => at(selected).kind === 'card' || from === selected || to === selected;
  // Hit areas are invisibly larger than the mark and grow as the map zooms out.
  const hit = $derived(Math.min(2.2, Math.max(1, 1 / cam.s)));

  const halfWidth = (label: string) => Math.max(18, label.length * 3.6 + 10);
  const cardWidth = (label: string) => label.length * 7 + 22;

  function select(id: string) {
    selected = id;
  }
  function onEmptyClick(e: MouseEvent) {
    if (performance.now() < swallowUntil) { swallowUntil = 0; return; }
    if ((e.target as Element).closest('.credits-node')) return;
    select('card');
  }
  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || selected === 'card') return;
    select('card');
    e.stopPropagation(); // the first Esc leaves the selection; the next one (on the card) folds the panel
  }

  // ---- drag to pan, wheel / pinch to zoom --------------------------------------------
  const down = new Map<number, { x: number; y: number }>();
  let drag: { id: number; moved: boolean } | null = null;
  let pinch: { d: number; mx: number; my: number } | null = null;
  let swallowUntil = 0; // a click right after a drag is the drag's, not a tap
  const swallowNext = () => { swallowUntil = performance.now() + 60; };
  const dist = () => { const [a, b] = [...down.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  const mid = () => { const [a, b] = [...down.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  const unitsPerPx = () => VIEW.width / (svg.getBoundingClientRect().width || VIEW.width);
  function panBy(dx: number, dy: number) {
    const k = unitsPerPx() / cam.s;
    cam = { ...cam, cx: cam.cx - dx * k, cy: cam.cy - dy * k };
  }
  function zoomAt(clientX: number, clientY: number, factor: number) {
    const r = svg.getBoundingClientRect(), k = VIEW.width / (r.width || VIEW.width);
    const vx = (clientX - r.left) * k - VIEW.width / 2, vy = (clientY - r.top) * k - VIEW.height / 2;
    const px = cam.cx + vx / cam.s, py = cam.cy + vy / cam.s; // the world point under the cursor
    const s = Math.min(2.5, Math.max(0.2, cam.s * factor));
    cam = { s, cx: px - vx / s, cy: py - vy / s };
  }
  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    down.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (down.size === 1) drag = { id: e.pointerId, moved: false };
    else if (down.size === 2) { // a second finger: pinch, never a click
      const m = mid();
      pinch = { d: dist(), mx: m.x, my: m.y };
      drag = null; swallowNext(); live = true;
    }
  }
  function onPointerMove(e: PointerEvent) {
    const prev = down.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    down.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && down.size === 2) {
      const m = mid(), d = dist();
      panBy(m.x - pinch.mx, m.y - pinch.my);
      zoomAt(m.x, m.y, d / pinch.d);
      pinch = { d, mx: m.x, my: m.y };
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved) {
      const slop = e.pointerType === 'mouse' ? 5 : 12; // a finger wobbles more than a mouse
      if (Math.hypot(dx, dy) < slop) { down.set(e.pointerId, prev); return; }
      drag.moved = true;
      try { svg.setPointerCapture(e.pointerId); } catch { /* synthetic pointers can't be captured */ }
      live = true;
    }
    panBy(dx, dy);
  }
  function onPointerEnd(e: PointerEvent) {
    if (!down.delete(e.pointerId)) return;
    if (drag?.moved) swallowNext();
    if (pinch && down.size < 2) {
      pinch = null;
      const [id] = [...down.keys()]; // the finger left on the glass carries on as a pan
      drag = id === undefined ? null : { id, moved: true };
    } else if (drag && e.pointerId === drag.id) drag = null;
    if (down.size === 0) live = false;
  }
  let liveTimer = 0;
  function onWheel(e: WheelEvent) {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    live = true;
    clearTimeout(liveTimer);
    liveTimer = window.setTimeout(() => { if (down.size === 0) live = false; }, 160);
  }
  // Svelte attaches wheel passively; preventDefault needs a real non-passive listener.
  function wheelAction(node: SVGSVGElement) {
    node.addEventListener('wheel', onWheel, { passive: false });
    return { destroy: () => node.removeEventListener('wheel', onWheel) };
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -- empty-space click and Esc are shortcuts; every node is a focusable button -->
<svg
  class="credits-map"
  bind:this={svg}
  use:wheelAction
  viewBox="0 0 {VIEW.width} {VIEW.height}"
  role="group"
  aria-label="Credits map"
  onclick={onEmptyClick}
  onkeydown={onKeydown}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerEnd}
  onpointercancel={onPointerEnd}
>
  <g
    class="credits-world"
    class:is-live={live}
    style="--credits-hit: {hit}; transform: translate({VIEW.width / 2}px, {VIEW.height / 2}px) scale({cam.s}) translate({-cam.cx}px, {-cam.cy}px)"
  >
    {#each graph.edges as e (e.from + '>' + e.to)}
      <line class="credits-edge" class:is-faded={!edgeLit(e.from, e.to)} x1={at(e.from).x} y1={at(e.from).y} x2={at(e.to).x} y2={at(e.to).y} />
    {/each}
    {#each graph.nodes as n (n.id)}
      <g
        class="credits-node"
        class:is-selected={n.id === selected}
        class:is-faded={!lit.has(n.id)}
        data-kind={n.kind}
        data-id={n.id}
        style="transform: translate({n.x}px, {n.y}px)"
        role="button"
        tabindex="0"
        aria-label={n.label}
        aria-pressed={n.id === selected}
        onclick={() => select(n.id)}
        onkeydown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(n.id); } }}
      >
        <rect class="credits-hit" x={-(n.kind === 'card' ? cardWidth(n.label) / 2 : halfWidth(n.label))} y="-26" width={n.kind === 'card' ? cardWidth(n.label) : halfWidth(n.label) * 2} height="52" />
        {#if n.kind === 'card'}
          <rect class="credits-shape" x={-cardWidth(n.label) / 2} y="-13" width={cardWidth(n.label)} height="26" rx="3" />
          <text class="credits-label" text-anchor="middle" y="4">{n.label}</text>
        {:else}
          {#if n.kind === 'person'}
            <circle class="credits-shape" r="8" />
          {:else}
            <rect class="credits-shape" x={n.kind === 'role' ? -6 : -4} y={n.kind === 'role' ? -6 : -4} width={n.kind === 'role' ? 12 : 8} height={n.kind === 'role' ? 12 : 8} transform="rotate(45)" />
          {/if}
          <text class="credits-label" text-anchor="middle" y="-14">{n.label}</text>
        {/if}
      </g>
    {/each}
  </g>
</svg>

<style>
  .credits-map {
    display: block;
    width: 100%;
    height: var(--credits-map-height);
    overflow: hidden;
    touch-action: none;
    cursor: grab;
  }
  .credits-map:active { cursor: grabbing; }
  .credits-world { transition: transform 0.7s cubic-bezier(0.3, 0, 0.2, 1); }
  .credits-world.is-live { transition: none; }
  .credits-edge { stroke: var(--color-text); stroke-width: 1; }
  .credits-edge.is-faded { stroke-width: 0.5; stroke-dasharray: var(--credits-faded-dash); }
  .credits-node { cursor: pointer; outline: none; transition: transform 0.6s cubic-bezier(0.3, 0, 0.2, 1); }
  .credits-hit {
    fill: transparent;
    pointer-events: all;
    transform-box: fill-box;
    transform-origin: center;
    transform: scale(var(--credits-hit, 1));
  }
  .credits-shape { fill: var(--color-text); stroke: var(--color-text); stroke-width: 2; }
  .credits-node[data-kind='card'] .credits-shape,
  .credits-node[data-kind='role'] .credits-shape { fill: var(--color-bg); stroke-width: 1.5; }
  .credits-node[data-kind='card'] .credits-label { fill: var(--color-text); }
  .credits-label {
    font-size: 13px;
    fill: var(--color-text);
    paint-order: stroke;
    stroke: var(--color-bg);
    stroke-width: 4px;
  }
  .credits-node[data-kind='role'] .credits-label { font-style: italic; }
  .credits-node.is-selected .credits-shape { stroke-width: 4; }
  .credits-node.is-selected .credits-label { font-size: 15px; font-weight: 700; }
  /* Faded: hollow outline, thin dashes and a lighter weight. Never opacity, which would render a grey. */
  .credits-node.is-faded .credits-shape {
    fill: none;
    stroke-width: 1;
    stroke-dasharray: var(--credits-faded-dash);
  }
  .credits-node.is-faded .credits-label { font-weight: 300; }
  .credits-node:focus-visible .credits-label { text-decoration: underline; }
  @media (hover: hover) { .credits-node:hover .credits-label { text-decoration: underline; } }
  @media (prefers-reduced-motion: reduce) {
    .credits-world, .credits-node { transition: none; }
  }
</style>
