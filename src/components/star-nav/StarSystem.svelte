<script lang="ts">
  import type { HeaderMediaProps } from '@render/header-media';
  import DitherSvg from '@components/dither-svg/DitherSvg.svelte';
  import DitherLayer from '@components/dither-svg/DitherLayer.svelte';
  import HitLayer from '@components/dither-svg/HitLayer.svelte';
  import { onDestroy, onMount, untrack, type Component } from 'svelte';
  import { cubicInOut as easeInOut } from 'svelte/easing';
  import { Planet } from './planet';
  import { planApproach, type Approach } from './sim/approach';
  import { approachFrame, dragToControls, isDrag, type DragFrame } from './sim/dragFrame';
  import { flightPlan, type FlightPlan } from './sim/flightPlan';
  import { reachShape } from './sim/steering';
  import { routeUpTo } from './sim/route';
  import { defaultTuning, type Tuning } from './sim/tuning';
  import type { StarSystem } from './star_system';
  import type { Pose } from './types';

  const { entryId, images }: HeaderMediaProps = $props();

  const STAR_RADIUS = 0.15;
  const PLANET_RADIUS = 0.05;
  const PLANET_HIT_RADIUS = 0.3;
  // (the coarse-pointer radius is a CSS rule at the bottom — it is layout)
  const ORBIT_RADIUS = 0.02;
  // dither level of the ghost planets shown at the intercept moment
  const PREVIEW_LEVEL = 8;
  // wall-clock ms the ghosts take to travel from now to the intercept moment
  const PREVIEW_MS = 500;
  const SHIP_SCALE = 0.05;
  // Nose at the local origin, pointing up; tail 3 units behind.
  const SHIP_PATH = 'M -1 3 l 0 -2 l 1 -1 l 1 1 l 0 2';
  // The mechanic's numbers (speed, turning radius, turn cap) live in sim/tuning.
  // The island holds the one tuning object and hands it to every pure function.
  // Replaced wholesale (never mutated), so the dev panel only ever swaps it.
  //
  // The control scheme is part of it. Only a development build ever starts
  // anywhere but the default: the gate is inline so the bundler folds it away
  // and no production code reads the URL for it.
  let tuning = $state.raw<Tuning>({ ...defaultTuning, ...devSchemeFromUrl() });

  function devSchemeFromUrl(): Pick<Tuning, 'controlScheme'> | null {
    if (import.meta.env.DEV && typeof location !== 'undefined'
      && new URLSearchParams(location.search).get('scheme') === 'approach') {
      return { controlScheme: 'approach' };
    }
    return null;
  }

  // The dev-only tuning panel. Both gates are written inline so the bundler
  // folds `import.meta.env.DEV` to false in production and drops the dynamic
  // import, and with it the panel's component, markup and styles.
  let TunePanel = $state.raw<Component<{ tuning: Tuning; onchange: (t: Tuning) => void }> | null>(null);
  onMount(() => {
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('tune')) {
      import('./StarTune.svelte').then((m) => { TunePanel = m.default; });
    }
  });
  // The ship's reach shape, drawn dithered at this level.
  const REACH_LEVEL = 1;
  // Under prefers-reduced-motion the reveal and the trip still happen — where
  // things end up along an orbit is the point of them, not decoration — but
  // they run this many times faster, and without easing.
  const REDUCED_SPEEDUP = 5;
  // The dotted route from the ship to a visitable intercept point
  const ROUTE_LEVEL = 8;
  const ROUTE_DASH = 0.08;
  // The pass through the slingshot, the stop (a thick segment with a marker
  // where it begins) and the earliest allowed choice point.
  const ENCOUNTER_LEVEL = 12;
  const STOP_LEVEL = 16;
  const STOP_WIDTH = 0.06;
  const STOP_MARKER_RADIUS = 0.07;
  const EARLIEST_MARKER_RADIUS = 0.09;
  // Flying a plan: wall-clock ms per second of orbit time, and the ring drawn
  // round the ship while it is stopped for an action.
  const FLIGHT_MS_PER_SECOND = 500;
  const FLYING_STOP_RADIUS = 0.2;

  const system: StarSystem = {
    star: {},
    planets: [
      new Planet({r: 1, e: 0.1, angle: 30, period: 5, phase: 0, mass: 1}),
      new Planet({r: 0.5, e: 0.15, angle: 35, period: 2, phase: 0.3, mass: 0.5}),
      new Planet({r: 3, e: 0.3, angle: 29, period: 15, phase: 0.6, mass: 4}),
      new Planet({r: 3.5, e: 0.35, angle: 32, period: 25, phase: 0.9, mass: 2.5})
    ]
  }

  // Where the ship starts, and what `reset()` puts it back to. Heading is
  // degrees clockwise from straight up (the way the ship path points at 0).
  const SHIP_START = { x: 0, y: 4, heading: 0 };

  // Ship pose in viewBox units.
  let ship = $state<Pose>({ ...SHIP_START });

  // Orbit time, in seconds: where the system actually is. Every planet
  // position derives from it.
  let baseTime = $state(0);

  // Positions are read by both the visible and the hit layer, so compute them
  // once here rather than in each {@const}.
  const positions = $derived(system.planets.map((p) => p.positionAt(baseTime)));
  const hitOrder = system.planets
    .map((_, i) => i)
    .sort((a, b) => system.planets[b].ra - system.planets[a].ra);

  // For each planet, the curved approach the ship (leaving now) would fly, or
  // null when the planet is not visitable. Derived rather than computed on
  // hover so the cursor is right the moment the pointer arrives.
  const approaches = $derived<(Approach | null)[]>(
    system.planets.map((planet) => planApproach(ship, baseTime, planet, tuning))
  );

  // The island stores only inputs: the ship, the time, which planet is
  // hovered, which is selected, and the drag in progress. Everything drawn
  // is derived from them.
  //
  // A tap selects a planet (a touch has no hover, so this is the first the
  // planet hears of it); a drag from a planet plans a flight past it and
  // releasing the drag commits. The drag's frame (its axes, its limits) and
  // the planet's pinned arrival time are fixed at press: moving the finger
  // reshapes the route, never the axes or the moment the planet is met.
  let hovered = $state<number | null>(null);
  let selected = $state<number | null>(null);
  type Drag = {
    i: number;
    frame: DragFrame;
    pinnedArrival: number;
    originX: number;
    originY: number;
    dx: number;
    dy: number;
  };
  let drag = $state<Drag | null>(null);

  // The plan being flown, if any. `ship` and `baseTime` are driven along it
  // frame by frame; nothing else about the flight is stored.
  type Flight = { plan: FlightPlan; from: number };
  let flight = $state<Flight | null>(null);
  let flightFrame: number | null = null;
  // Stopped for an action: past the choice point, not yet arrived.
  const stopped = $derived(
    flight !== null && baseTime >= flight.plan.choiceTime && baseTime < flight.plan.endTime
  );

  const dragVector = $derived(drag ? { x: drag.dx, y: drag.dy } : null);
  const dragging = $derived(drag !== null && isDrag(dragVector!, drag.frame));
  const controls = $derived(drag ? dragToControls(dragVector!, drag.frame, tuning) : null);
  const plan = $derived<FlightPlan | null>(
    dragging && drag && controls
      ? flightPlan({
          ship, time: baseTime, system, target: drag.i, controls,
          pinnedArrival: drag.pinnedArrival, tuning,
        })
      : null
  );

  // The planet whose preview is up: the one being dragged, else the hovered
  // one, else the selected one. A planet that isn't visitable previews nothing.
  const previewIndex = $derived(flight ? null : (drag?.i ?? hovered ?? selected));
  const preview = $derived<Approach | null>(
    previewIndex === null ? null : approaches[previewIndex]
  );

  // The preview reveals over PREVIEW_MS of wall-clock time: `previewProgress`
  // (0-1, eased) is how far it has got, driven by a rAF loop that restarts
  // whenever the planet previewed changes. The ghosts sit at the time
  // interpolated between now and the arrival, and the route grows along its
  // length. While dragging the whole plan is shown at once.
  let previewProgress = $state(0);
  const shownProgress = $derived(dragging ? 1 : previewProgress);
  // A plan in the `approach` scheme re-solves its arrival time as the drag
  // moves; in `commitment` the plan's is the pinned one, the preview's own.
  const previewArrival = $derived(plan ? plan.arrivalTime : preview?.arrivalTime ?? null);
  const previewTime = $derived(
    preview === null || previewArrival === null
      ? null
      : baseTime + (previewArrival - baseTime) * shownProgress
  );
  const previewPositions = $derived.by(() => {
    const at = previewTime;
    return at === null ? [] : system.planets.map((p) => p.positionAt(at));
  });
  // The part of the route revealed so far.
  const revealed = $derived(preview ? routeUpTo(preview.route, shownProgress) : null);

  // The reach shape from where steering would start: after the stop of a plan
  // being dragged, else from the ship.
  const reach = $derived(
    flight ? flight.plan.reachShape : plan ? plan.reachShape : reachShape(ship, tuning)
  );

  let previewFrame: number | null = null;

  const reducedMotion = () =>
    typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const linear = (t: number) => t;

  function restartReveal(visitable: boolean) {
    cancelPreviewLoop();
    previewProgress = 0;
    if (!visitable) return;

    const reduced = reducedMotion();
    const duration = reduced ? PREVIEW_MS / REDUCED_SPEEDUP : PREVIEW_MS;
    const ease = reduced ? linear : easeInOut;

    const startedAt = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / duration);
      previewProgress = ease(t);
      previewFrame = t < 1 ? requestAnimationFrame(step) : null;
    };
    previewFrame = requestAnimationFrame(step);
  }

  $effect(() => {
    const visitable = preview !== null;
    previewIndex; // restart when the planet previewed changes
    untrack(() => restartReveal(visitable));
  });

  function cancelPreviewLoop() {
    if (previewFrame !== null) cancelAnimationFrame(previewFrame);
    previewFrame = null;
  }

  function press(e: PointerEvent, i: number) {
    if (flight) return;
    const approach = approaches[i];
    if (!approach) return;
    const target = e.currentTarget as Element;
    target.setPointerCapture(e.pointerId);
    const boxWidth = target.closest('svg')!.getBoundingClientRect().width;
    // The earliest allowed commitment depends on the pass, which the drag is
    // still to choose, so the frame leaves it at 0 and the plan raises a
    // commit that is too early.
    const base = {
      boxWidth,
      deadZone: e.pointerType === 'mouse' ? 0 : tuning.touchDeadPx,
      minOffset: PLANET_RADIUS,
      lowestCommit: 0,
    };
    const pinnedArrival = approach.arrivalTime;
    drag = {
      i,
      frame: approachFrame(ship, approach.arrivalPose, base),
      pinnedArrival,
      originX: e.clientX,
      originY: e.clientY,
      dx: 0,
      dy: 0,
    };
  }

  function move(e: PointerEvent) {
    if (!drag) return;
    drag.dx = e.clientX - drag.originX;
    drag.dy = e.clientY - drag.originY;
  }

  function cancelFlight() {
    if (flightFrame !== null) cancelAnimationFrame(flightFrame);
    flightFrame = null;
    flight = null;
  }

  // Fly the ship along the plan's timeline, taking the orbit clock with it.
  function fly(to: FlightPlan) {
    cancelFlight();
    const from = baseTime;
    flight = { plan: to, from };
    const reduced = reducedMotion();
    const duration = ((to.endTime - from) * FLIGHT_MS_PER_SECOND) / (reduced ? REDUCED_SPEEDUP : 1);
    const ease = reduced ? linear : easeInOut;
    const startedAt = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - startedAt) / duration);
      if (p < 1) {
        const t = from + (to.endTime - from) * ease(p);
        ship = to.positionAt(t);
        baseTime = t;
        flightFrame = requestAnimationFrame(step);
      } else {
        ship = { ...to.afterPose };
        baseTime = to.endTime;
        flightFrame = null;
        flight = null;
      }
    };
    flightFrame = requestAnimationFrame(step);
  }

  // Releasing a drag flies the ship along the plan; releasing a tap selects
  // the planet.
  function release() {
    if (!drag) return;
    const { i } = drag;
    const to = plan;
    const wasDrag = dragging;
    drag = null;
    if (!wasDrag) { selected = i; return; }
    if (to?.valid) {
      selected = null;
      hovered = null;
      fly(to);
    }
  }

  function cancel() {
    drag = null;
  }

  // Nothing here is recoverable once the ship has flown — there is no history
  // to step back through — so the way out is the way back to the start. The
  // button offering it only exists once something has actually moved.
  const moved = $derived(
    baseTime !== 0
    || ship.x !== SHIP_START.x
    || ship.y !== SHIP_START.y
    || ship.heading !== SHIP_START.heading,
  );

  function reset() {
    cancelFlight();
    drag = null;
    selected = null;
    baseTime = 0;
    ship = { ...SHIP_START };
  }

  onDestroy(() => { cancelPreviewLoop(); cancelFlight(); });
</script>

<div class="star-system">
<DitherSvg viewBox="-5 -5 10 10">

  <!-- The ship's reach shape, in viewBox coordinates. While a move is being
       planned it is the one the ship would have on arrival. -->
  <DitherLayer level={REACH_LEVEL}>
    <polygon class="reach"
      points={reach.map((p) => `${p.x},${p.y}`).join(' ')} />
  </DitherLayer>

  <DitherLayer level={4}>
    <circle cx="0" cy="0" r={STAR_RADIUS} />
  </DitherLayer>

  <DitherLayer level={8}>
    {#each system.planets as planet}
      <ellipse
        fill="none" stroke-width={ORBIT_RADIUS}
        transform="rotate({planet.angle})"
        cx={planet.offset} cy="0" rx={planet.ra} ry={planet.rb} />
    {/each}
  </DitherLayer>

  <!-- Mounted only while previewing: a mask that empties out isn't reliably
        repainted (Firefox), so the whole layer comes and goes instead. -->
  {#if previewPositions.length > 0}
    <DitherLayer level={PREVIEW_LEVEL}>
      {#each previewPositions as p}
        <circle cx={p.x} cy={p.y} r={PLANET_RADIUS} />
      {/each}
      {#if plan}
        <path
          transform="translate({plan.afterPose.x} {plan.afterPose.y}) rotate({plan.afterPose.heading}) scale({SHIP_SCALE})"
          d={SHIP_PATH} />
      {/if}
    </DitherLayer>
  {/if}

  {#if revealed}
    <DitherLayer level={ROUTE_LEVEL}>
      <polyline class="route" fill="none"
        points={(plan ? plan.route : revealed.points).map((p) => `${p.x},${p.y}`).join(' ')}
        stroke-width={ORBIT_RADIUS} stroke-dasharray="{ROUTE_DASH} {ROUTE_DASH}" />
    </DitherLayer>
  {/if}

  {#if plan}
    <DitherLayer level={ENCOUNTER_LEVEL}>
      <polyline class="encounter" fill="none"
        points={plan.encounterPath.map((p) => `${p.x},${p.y}`).join(' ')}
        stroke-width={ORBIT_RADIUS} />
      <circle class="earliest" fill="none" stroke-width={ORBIT_RADIUS}
        cx={plan.lowestCommitPose.x} cy={plan.lowestCommitPose.y} r={EARLIEST_MARKER_RADIUS} />
    </DitherLayer>
    <DitherLayer level={STOP_LEVEL}>
      <polyline class="stop" fill="none"
        points={plan.stopPath.map((p) => `${p.x},${p.y}`).join(' ')}
        stroke-width={STOP_WIDTH} />
      <circle class="stop-marker"
        cx={plan.choicePose.x} cy={plan.choicePose.y} r={STOP_MARKER_RADIUS} />
    </DitherLayer>
  {/if}

  {#if stopped}
    <DitherLayer level={STOP_LEVEL}>
      <circle class="flight-stop" fill="none" stroke-width={ORBIT_RADIUS}
        cx={ship.x} cy={ship.y} r={FLYING_STOP_RADIUS} />
    </DitherLayer>
  {/if}

  <DitherLayer level={16}>
    {#each positions as p}
      <circle cx={p.x} cy={p.y} r={PLANET_RADIUS} />
    {/each}

    <path
      transform="translate({ship.x} {ship.y}) rotate({ship.heading}) scale({SHIP_SCALE})"
      d={SHIP_PATH} />
  </DitherLayer>

  <!-- Outer orbits first so, where enlarged hit circles overlap, the inner
       planet stays on top. -->
  <HitLayer>
    {#each hitOrder as i}
      {@const p = positions[i]}
      <circle role="presentation" class="planet-hit"
        cx={p.x} cy={p.y} r={PLANET_HIT_RADIUS}
        style:cursor={approaches[i] ? 'pointer' : 'default'}
        onpointerenter={() => (hovered = i)}
        onpointerleave={() => (hovered = null)}
        onpointerdown={(e) => press(e, i)}
        onpointermove={move}
        onpointerup={release}
        onpointercancel={cancel} />
    {/each}
  </HitLayer>
</DitherSvg>

<!-- A real <button>, not an SVG shape in a HitLayer: the hit layers are
     aria-hidden decoration, and this is the one control here that a keyboard
     or a screen reader has to be able to reach. It is a sibling of the
     dithered box, never an ancestor — a transform or filter on an ancestor
     re-anchors the dither grid (docs/agents/styling.md). -->
{#if moved}
  <button class="star-reset" type="button" onclick={reset}>Reset</button>
{/if}

<!-- Dev only (?tune). A sibling of the dithered box, never an ancestor. -->
{#if TunePanel}
  <TunePanel {tuning} onchange={(t) => (tuning = t)} />
{/if}
</div>

<style>
  .star-system {
    position: relative;
  }

  /* Bottom right, inside the square the media occupies. Ink on paper with a
     dither on hover, like every other control on the site. */
  .star-reset {
    position: absolute;
    right: var(--space-sm);
    bottom: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-bg);
    color: var(--color-text);
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1;
    cursor: pointer;
  }

  .star-reset:hover {
    background: var(--color-bg-hover);
  }

  /* Fingers need bigger targets. `r` is a CSS geometry property, in viewBox
     units here, and overrides the attribute. */
  @media (pointer: coarse) {
    .planet-hit {
      r: 0.55;
    }
  }
</style>
