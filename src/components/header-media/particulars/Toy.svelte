<script lang="ts">
  // The view and the loop. It reads plain Snapshots from the headless World and
  // never touches a planck body; DOM events become the plain `Inputs` that
  // steer() consumes.
  import { onMount } from 'svelte';
  import type { Scenario } from '../../../lib/particulars/scenario/types';
  import { World } from '../../../lib/particulars/sim/world';
  import { stepsDue } from '../../../lib/particulars/sim/clock';
  import { steer, isSteerKey } from '../../../lib/particulars/input/steer';
  import type { Vec } from '../../../lib/particulars/input/steer';
  import { clientToWorld, hitsPlayer } from '../../../lib/particulars/input/pointer';
  import { glyphFor } from './glyph';
  import { FIXED_DT, MAX_STEPS_PER_FRAME, VIEW_MARGIN } from '../../../lib/particulars/constants';

  let { scenario, entryId }: { scenario: Scenario; entryId: string } = $props();

  // svelte-ignore state_referenced_locally -- the scenario is fixed for the lifetime of a mount
  const world = new World(scenario);
  let snapshot = $state(world.snapshot());

  const view = $derived({
    x: -snapshot.walls.width / 2 - VIEW_MARGIN,
    y: -snapshot.walls.height / 2 - VIEW_MARGIN,
    width: snapshot.walls.width + VIEW_MARGIN * 2,
    height: snapshot.walls.height + VIEW_MARGIN * 2,
  });

  let svg: SVGSVGElement;
  // Held input, in world units. Plain data, not reactive: only the loop reads it.
  const heldKeys = new Set<string>();
  const heldPointers = new Map<number, Vec>();

  function worldPoint(e: PointerEvent): Vec {
    const r = svg.getBoundingClientRect();
    return clientToWorld({ x: e.clientX, y: e.clientY }, r, view);
  }

  function onPointerDown(e: PointerEvent) {
    const p = worldPoint(e);
    // A press on the player is the action (a later issue), never steering.
    if (hitsPlayer(p, snapshot.player)) return;
    heldPointers.set(e.pointerId, p);
    svg.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: PointerEvent) {
    if (heldPointers.has(e.pointerId)) heldPointers.set(e.pointerId, worldPoint(e));
  }
  function onPointerUp(e: PointerEvent) {
    heldPointers.delete(e.pointerId);
  }

  function isTyping(t: EventTarget | null) {
    const el = t as HTMLElement | null;
    return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
  }
  function onKeyDown(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || !isSteerKey(e.key)) return;
    heldKeys.add(e.key);
    e.preventDefault();
  }
  function onKeyUp(e: KeyboardEvent) {
    heldKeys.delete(e.key);
  }
  function releaseAll() {
    heldKeys.clear();
    heldPointers.clear();
  }

  onMount(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;

    function frame(now: number) {
      const due = stepsDue(acc, (now - last) / 1000, FIXED_DT, MAX_STEPS_PER_FRAME);
      last = now;
      acc = due.remainder;
      for (let i = 0; i < due.steps; i++) {
        const s = world.snapshot().player;
        world.step(steer({ pointers: [...heldPointers.values()], keys: [...heldKeys] }, s));
      }
      if (due.steps > 0) snapshot = world.snapshot();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseAll);
    };
  });
</script>

<svg
  bind:this={svg}
  class="particulars"
  data-entry={entryId}
  viewBox="{view.x} {view.y} {view.width} {view.height}"
  role="img"
  aria-label="A particle in a walled box. Steer it with the arrow keys, WASD, or by holding a pointer."
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
>
  <rect
    class="walls"
    x={-snapshot.walls.width / 2}
    y={-snapshot.walls.height / 2}
    width={snapshot.walls.width}
    height={snapshot.walls.height}
  />
  {#each snapshot.particles as p (p.id)}
    {@const glyph = glyphFor(p.type)}
    <g
      class="particle"
      data-type={p.type}
      data-colour={p.colour}
      data-parity={p.parity}
      data-live={p.live}
      transform="translate({p.x} {p.y})"
    >
      {#if !p.live}
        <circle class="telegraph" r={p.radius * 1.6} />
      {/if}
      {#if glyph.kind === 'circle'}
        <circle class="shape" r={p.radius} />
      {:else}
        <polygon class="shape" points={glyph.points(p.radius)} />
      {/if}
    </g>
  {/each}
  <circle class="player" cx={snapshot.player.x} cy={snapshot.player.y} r={snapshot.player.radius} />
</svg>

<style>
  .particulars {
    display: block;
    width: 100%;
    max-height: 70vh;
    touch-action: none;
    user-select: none;
  }
  .walls {
    fill: none;
    stroke: var(--color-text);
    stroke-width: 0.15;
  }
  .player {
    fill: var(--color-text);
  }
  /* Parity: matter is solid, antimatter is an outline. Colour (strong force) is
     the outline's dash pattern, because the palette has no spare hues. */
  .particle .shape {
    stroke: var(--color-text);
    stroke-width: 0.1;
    fill: var(--color-text);
  }
  .particle[data-parity='-1'] .shape {
    fill: none;
  }
  .particle[data-colour='red'] .shape {
    stroke-dasharray: 0.25 0.12;
  }
  .particle[data-colour='green'] .shape {
    stroke-dasharray: 0.04 0.1;
    stroke-linecap: round;
  }
  .particle[data-colour='blue'] .shape {
    stroke-dasharray: 0.3 0.1 0.04 0.1;
  }
  .telegraph {
    fill: none;
    stroke: var(--color-text);
    stroke-width: 0.06;
    stroke-dasharray: 0.15 0.15;
  }
  .particle[data-live='false'] .shape {
    stroke-dasharray: none;
    fill: none;
  }
</style>
