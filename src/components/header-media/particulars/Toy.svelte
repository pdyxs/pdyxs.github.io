<script lang="ts">
  // The view and the loop. It reads plain Snapshots from the headless World and
  // never touches a planck body; DOM events become the plain `Inputs` that
  // steer() consumes.
  import { onMount } from 'svelte';
  import type { ForceName, Scenario } from '../../../lib/particulars/scenario/types';
  import { World } from '../../../lib/particulars/sim/world';
  import { stepsDue } from '../../../lib/particulars/sim/clock';
  import { steer, isSteerKey } from '../../../lib/particulars/input/steer';
  import type { Vec } from '../../../lib/particulars/input/steer';
  import { clientToWorld, pressKind } from '../../../lib/particulars/input/pointer';
  import { intentFor, inputEventForKey } from '../../../lib/particulars/input/bindings';
  import type { InputEvent, Intent } from '../../../lib/particulars/input/bindings';
  import { listenCommands } from '../../../lib/particulars/input/command';
  import { installPageButtons } from './page-buttons';
  import { glyphFor } from './glyph';
  import { FIXED_DT, FORCE_LABEL_SPACING, MAX_STEPS_PER_FRAME, VIEW_MARGIN } from '../../../lib/particulars/constants';

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

  // The readout's wording is view business; whether a force is on comes from the Snapshot.
  const FORCE_LABELS: { name: ForceName; label: string }[] = [
    { name: 'strong', label: 'strong' },
    { name: 'weak', label: 'weak' },
    { name: 'em', label: 'EM' },
    { name: 'gravity', label: 'gravity' },
  ];

  let svg: SVGSVGElement;
  // Held input, in world units. Plain data, not reactive: only the loop reads it.
  const heldKeys = new Set<string>();
  const heldPointers = new Map<number, Vec>();
  // Intents fired since the last step. The bindings table decides what each input means.
  let pending: Intent[] = [];
  // Page buttons pressed since the last step (Commands addressed to this card's uid).
  let pressedButtons: string[] = [];

  function fire(event: InputEvent) {
    const intent = intentFor(event, world.snapshot().forces);
    if (intent) pending.push(intent);
  }

  function worldPoint(e: PointerEvent): Vec {
    const r = svg.getBoundingClientRect();
    return clientToWorld({ x: e.clientX, y: e.clientY }, r, view);
  }

  function onPointerDown(e: PointerEvent) {
    const p = worldPoint(e);
    // A press on the player is the action, never steering.
    if (pressKind(p, snapshot.player) === 'tap-self') {
      fire('tap-self');
      return;
    }
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
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
    const event = inputEventForKey(e.key);
    if (event) {
      if (!e.repeat) fire(event);
      e.preventDefault();
      return;
    }
    if (!isSteerKey(e.key)) return;
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
        world.step(steer({ pointers: [...heldPointers.values()], keys: [...heldKeys] }, s), pending, pressedButtons);
        pending = [];
        pressedButtons = [];
      }
      if (due.steps > 0) snapshot = world.snapshot();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAll);
    const stopCommands = listenCommands(window, entryId, (c) => pressedButtons.push(c.button));
    const releasePageButtons = installPageButtons();
    return () => {
      stopCommands();
      releasePageButtons();
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
  aria-label="A particle in a walled box. Steer it with the arrow keys, WASD, or by holding a pointer. Space, or a tap on the particle, uses its action."
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
  {#each snapshot.blackHoles as h, i (i)}
    <circle class="black-hole" data-active={snapshot.forces.gravity} cx={h.x} cy={h.y} r={h.radius} />
  {/each}
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
  {#if snapshot.player.alive}
    {@const glyph = glyphFor(snapshot.player.type)}
    <g
      class="player"
      data-type={snapshot.player.type}
      data-colour={snapshot.player.colour}
      data-parity={snapshot.player.parity}
      transform="translate({snapshot.player.x} {snapshot.player.y})"
    >
      {#if glyph.kind === 'circle'}
        <circle class="shape" r={snapshot.player.radius} />
      {:else}
        <polygon class="shape" points={glyph.points(snapshot.player.radius)} />
      {/if}
    </g>
  {/if}
  <g class="forces" aria-label="Forces">
    {#each FORCE_LABELS as f, i (f.name)}
      <text
        x={-snapshot.walls.width / 2 + 0.4 + i * FORCE_LABEL_SPACING}
        y={-snapshot.walls.height / 2 + 0.9}
        data-force={f.name}
        data-on={snapshot.forces[f.name]}>{f.label} {snapshot.forces[f.name] ? 'on' : 'off'}</text
      >
    {/each}
  </g>
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
  .forces text {
    font-size: 0.6px;
    fill: var(--color-text);
  }
  .forces text[data-on='false'] {
    text-decoration: line-through;
  }
  /* A black hole is an outline while dormant and solid once gravity pulls. */
  .black-hole {
    fill: none;
    stroke: var(--color-text);
    stroke-width: 0.1;
  }
  .black-hole[data-active='true'] {
    fill: var(--color-text);
  }
  .player .shape {
    fill: var(--color-text);
    stroke: var(--color-text);
    stroke-width: 0.1;
  }
  .player[data-parity='-1'] .shape {
    fill: none;
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
