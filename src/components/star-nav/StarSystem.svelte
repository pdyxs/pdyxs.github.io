<script lang="ts">
  import type { HeaderMediaProps } from '@render/header-media';
  import DitherSvg from '@components/dither-svg/DitherSvg.svelte';
  import DitherLayer from '@components/dither-svg/DitherLayer.svelte';
  import HitLayer from '@components/dither-svg/HitLayer.svelte';
  import { onDestroy } from 'svelte';
  import { cubicInOut as easeInOut } from 'svelte/easing';
  import { Planet } from './planet';
  import { planApproach, type Approach } from './sim/approach';
  import { reachShape } from './sim/steering';
  import { routeUpTo } from './sim/route';
  import { defaultTuning } from './sim/tuning';
  import type { StarSystem } from './star_system';
  import type { Point, Pose } from './types';

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
  const tuning = defaultTuning;
  // The ship's reach shape, drawn dithered at this level.
  const REACH_LEVEL = 1;
  // How much a finger may wobble on touch-down and still be a tap.
  // seconds of orbit time per wall-clock second while travelling
  const TIME_SCALE = 1;
  // Under prefers-reduced-motion the reveal and the trip still happen — where
  // things end up along an orbit is the point of them, not decoration — but
  // they run this many times faster, and without easing.
  const REDUCED_SPEEDUP = 5;
  // The dotted route from the ship to a visitable intercept point
  const ROUTE_LEVEL = 8;
  const ROUTE_DASH = 0.08;

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

  // While a visitable planet is hovered, ghosts show where every planet will be
  // at the moment the ship, leaving now, would arrive, and the curved route
  // grows from the ship to the arrival point. The real planets don't move, so
  // the hit circle under the pointer stays put. A planet that isn't visitable
  // has no arrival moment, so it previews nothing.
  //
  // `preview` is the hover's target approach; `previewProgress` (0-1, eased) is
  // how far the reveal has got, driven by a rAF loop over PREVIEW_MS of
  // wall-clock time. Everything drawn derives from the two: the ghosts sit
  // at the time interpolated between now and the arrival, and the route
  // grows along its length. Pointer-out cancels the loop and nulls the
  // target, which unmounts both layers.
  let preview = $state<Approach | null>(null);
  let previewProgress = $state(0);

  const previewTime = $derived(
    preview === null ? null : baseTime + (preview.arrivalTime - baseTime) * previewProgress
  );
  const previewPositions = $derived.by(() => {
    const at = previewTime;
    return at === null ? [] : system.planets.map((p) => p.positionAt(at));
  });
  // The part of the route revealed so far, and the ghost ship at its tip,
  // which on arrival has the pose the ship will have.
  const revealed = $derived(preview ? routeUpTo(preview.route, previewProgress) : null);

  let previewFrame: number | null = null;

  const reducedMotion = () =>
    typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const linear = (t: number) => t;

  function startPreview(i: number) {
    if (travel) return;
    cancelPreviewLoop();
    const target = approaches[i];
    if (target === null) { preview = null; return; }
    preview = target;

    const reduced = reducedMotion();
    const duration = reduced ? PREVIEW_MS / REDUCED_SPEEDUP : PREVIEW_MS;
    const ease = reduced ? linear : easeInOut;

    const startedAt = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / duration);
      previewProgress = ease(t);
      previewFrame = t < 1 ? requestAnimationFrame(step) : null;
    };
    previewProgress = 0;
    previewFrame = requestAnimationFrame(step);
  }

  function endPreview() {
    if (travel) return;
    cancelPreviewLoop();
    preview = null;
    previewProgress = 0;
  }

  function cancelPreviewLoop() {
    if (previewFrame !== null) cancelAnimationFrame(previewFrame);
    previewFrame = null;
  }

  // Planning a move: pointer held down on a visitable planet. The pointer is
  // captured, so the hover preview stays up until the release flies the ship
  // there (or a cancel drops the plan).
  let plan = $state<{ i: number } | null>(null);

  // The ghost ship: where the revealed route has got to, and the reach shape
  // the ship would have from there.
  const ghostShip = $derived(plan && revealed ? revealed.pose : null);

  function beginPlan(e: PointerEvent, i: number) {
    if (travel || !approaches[i]) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    plan = { i };
    // A touch has no hover: this is the first the planet has heard of it.
    if (!preview) startPreview(i);
  }

  function commitPlan() {
    const target = plan ? approaches[plan.i] : null;
    plan = null;
    if (target) startTravel(target);
  }

  function cancelPlan() {
    plan = null;
  }

  // Travelling: baseTime runs forward at TIME_SCALE until it reaches the
  // arrival moment, and the ship slides along the curved route to meet
  // the planet. The hover preview is frozen at the arrival moment for the
  // duration (previewProgress pinned at 1), then everything clears.
  type Travel = { route: Point[]; fromTime: number; to: Approach };
  let travel = $state<Travel | null>(null);
  let travelFrame: number | null = null;

  function startTravel(to: Approach) {
    cancelPreviewLoop();
    previewProgress = 1;
    travel = { route: to.route, fromTime: baseTime, to };

    const rate = TIME_SCALE * (reducedMotion() ? REDUCED_SPEEDUP : 1);

    let last = performance.now();
    const step = (now: number) => {
      const t = travel!;
      baseTime = Math.min(t.to.arrivalTime, baseTime + ((now - last) / 1000) * rate);
      last = now;
      const progress = (baseTime - t.fromTime) / (t.to.arrivalTime - t.fromTime);
      ship = routeUpTo(t.route, progress).pose;
      if (baseTime < t.to.arrivalTime) travelFrame = requestAnimationFrame(step);
      else arrive();
    };
    travelFrame = requestAnimationFrame(step);
  }

  function arrive() {
    const t = travel!;
    baseTime = t.to.arrivalTime;
    ship = { ...t.to.arrivalPose };
    travel = null;
    travelFrame = null;
    endPreview();
  }

  function cancelTravelLoop() {
    if (travelFrame !== null) cancelAnimationFrame(travelFrame);
    travelFrame = null;
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
    cancelPreviewLoop();
    cancelTravelLoop();
    travel = null;
    plan = null;
    preview = null;
    previewProgress = 0;
    baseTime = 0;
    ship = { ...SHIP_START };
  }

  onDestroy(() => { cancelPreviewLoop(); cancelTravelLoop(); });
</script>

<div class="star-system">
<DitherSvg viewBox="-5 -5 10 10">

  <!-- The ship's reach shape, in viewBox coordinates. While a move is being
       planned it is the one the ship would have on arrival. -->
  <DitherLayer level={REACH_LEVEL}>
    <polygon class="reach"
      points={reachShape(ghostShip ?? ship, tuning).map((p) => `${p.x},${p.y}`).join(' ')} />
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
      {#if ghostShip}
        <path
          transform="translate({ghostShip.x} {ghostShip.y}) rotate({ghostShip.heading}) scale({SHIP_SCALE})"
          d={SHIP_PATH} />
      {/if}
    </DitherLayer>
  {/if}

  {#if revealed}
    <DitherLayer level={ROUTE_LEVEL}>
      <polyline class="route" fill="none"
        points={revealed.points.map((p) => `${p.x},${p.y}`).join(' ')}
        stroke-width={ORBIT_RADIUS} stroke-dasharray="{ROUTE_DASH} {ROUTE_DASH}" />
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
        onpointerenter={() => startPreview(i)}
        onpointerleave={endPreview}
        onpointerdown={(e) => beginPlan(e, i)}
        onpointerup={commitPlan}
        onpointercancel={cancelPlan} />
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
