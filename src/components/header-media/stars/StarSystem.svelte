<script lang="ts">
  import type { HeaderMediaProps } from '@render/header-media';
  import DitherSvg from '@components/dither-svg/DitherSvg.svelte';
  import DitherLayer from '@components/dither-svg/DitherLayer.svelte';
  import HitLayer from '@components/dither-svg/HitLayer.svelte';
  import { onDestroy } from 'svelte';
  import { cubicInOut as easeInOut } from 'svelte/easing';
  import { Planet } from './planet';
  import { interceptTime } from './intercept';
  import { conePath, inCone } from './cone';
  import { flyby, headingBetween } from './flyby';
  import type { StarSystem } from './star_system';
  import type { Point } from './types';

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
  // viewBox units per second of orbit time
  const SHIP_SPEED = 2;
  // The ship's view cone: full angle in degrees, reach in viewBox units
  // (longer than the viewBox diagonal so it always runs off the edge).
  const CONE_LEVEL = 1;
  const CONE_ANGLE = 40;
  const CONE_LENGTH = 15;
  // Planning a move: how a sideways drag shapes the fly-by (see flyby.ts),
  // what fraction of the box's width spans the whole range before the move
  // is off, and how much a finger may wobble on touch-down and still be a tap.
  const FLYBY = { farCone: 60, closeCone: 30, maxTurn: 90 };
  const DRAG_RANGE = 0.3;
  const TOUCH_DEAD_PX = 8;
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
      new Planet({r: 1, e: 0.1, angle: 30, period: 5, phase: 0}),
      new Planet({r: 0.5, e: 0.15, angle: 35, period: 2, phase: 0.3}),
      new Planet({r: 3, e: 0.3, angle: 29, period: 15, phase: 0.6}),
      new Planet({r: 3.5, e: 0.35, angle: 32, period: 25, phase: 0.9})
    ]
  }

  // Where the ship starts, and what `reset()` puts it back to. Heading is
  // degrees clockwise from straight up (the way the ship path points at 0).
  const SHIP_START = { x: 0, y: 4, heading: 0 };

  // Ship pose in viewBox units.
  let ship = $state({ ...SHIP_START });
  // Full angle of the ship's view cone; a fly-by resets it.
  let coneAngle = $state(CONE_ANGLE);

  // Orbit time, in seconds: where the system actually is. Every planet
  // position derives from it.
  let baseTime = $state(0);

  // Positions are read by both the visible and the hit layer, so compute them
  // once here rather than in each {@const}.
  const positions = $derived(system.planets.map((p) => p.positionAt(baseTime)));
  const hitOrder = system.planets
    .map((_, i) => i)
    .sort((a, b) => system.planets[b].ra - system.planets[a].ra);

  // For each planet, where and when the ship (leaving now) would meet it, and
  // whether that point is inside the view cone — i.e. whether the planet can
  // be navigated to. Derived rather than computed on hover so the cursor is
  // right the moment the pointer arrives.
  type Intercept = { at: number; meet: Point; visitable: boolean };
  const intercepts = $derived<(Intercept | null)[]>(
    system.planets.map((planet) => {
      const flight = interceptTime(planet, baseTime, ship, SHIP_SPEED);
      if (flight === null) return null;
      const at = baseTime + flight;
      const meet = planet.positionAt(at);
      return { at, meet, visitable: inCone(ship, ship.heading, coneAngle, CONE_LENGTH, meet) };
    })
  );

  // While a planet is hovered, ghosts show where every planet will be at the
  // moment the ship, leaving now, could reach the hovered one, and a route
  // line runs from the ship to the intercept point if it's inside the view
  // cone. The real planets don't move, so the hit circle under the pointer
  // stays put.
  //
  // `preview` is the hover's target; `previewProgress` (0–1, eased) is how
  // far the reveal has got, driven by a rAF loop over PREVIEW_MS of
  // wall-clock time. Everything drawn derives from the two: the ghosts sit
  // at the time interpolated between now and the intercept, and the route
  // line grows from the ship. Pointer-out cancels the loop and nulls the
  // target, which unmounts both layers.
  let preview = $state<{ at: number; route: Point | null } | null>(null);
  let previewProgress = $state(0);

  const previewTime = $derived(
    preview === null ? null : baseTime + (preview.at - baseTime) * previewProgress
  );
  const previewPositions = $derived.by(() => {
    const at = previewTime;
    return at === null ? [] : system.planets.map((p) => p.positionAt(at));
  });
  const routeEnd = $derived.by(() => {
    const to = preview?.route;
    if (!to) return null;
    return {
      x: ship.x + (to.x - ship.x) * previewProgress,
      y: ship.y + (to.y - ship.y) * previewProgress,
    };
  });

  let previewFrame: number | null = null;

  const reducedMotion = () =>
    typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const linear = (t: number) => t;

  function startPreview(i: number) {
    if (travel) return;
    cancelPreviewLoop();
    const target = intercepts[i];
    if (target === null) { preview = null; return; }
    preview = { at: target.at, route: target.visitable ? target.meet : null };

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
  // captured, so the hover preview stays up while the user drags sideways
  // to shape the fly-by. `offset` is the drag as a fraction of the range
  // (DRAG_RANGE of the box's width, measured on pointer-down; `dead` px of
  // wobble round the origin count as no drag); past ±1 the move is off (the
  // ghost ship and cone vanish) until the pointer comes back into range.
  let plan = $state<{ i: number; originX: number; range: number; dead: number; offset: number } | null>(null);

  // The pose the ship would arrive in, or null when nothing is planned or
  // the drag is out of range. The ghost ship and its cone draw from this.
  type Planned = { at: number; x: number; y: number; heading: number; coneAngle: number };
  const planned = $derived.by((): Planned | null => {
    if (!plan) return null;
    const target = intercepts[plan.i];
    if (!target?.visitable) return null;
    const result = flyby(plan.offset, headingBetween(ship, target.meet), FLYBY);
    if (!result) return null;
    return { at: target.at, x: target.meet.x, y: target.meet.y, ...result };
  });

  // The ghost ship and its cone ride the tip of the route line, so on a
  // touch (where the press starts the preview) they arrive with it.
  const ghostShip = $derived(
    planned && routeEnd ? { ...planned, x: routeEnd.x, y: routeEnd.y } : null
  );

  function beginPlan(e: PointerEvent, i: number) {
    if (travel || !intercepts[i]?.visitable) return;
    const target = e.currentTarget as Element;
    target.setPointerCapture(e.pointerId);
    const box = target.closest('svg')!.getBoundingClientRect().width;
    plan = {
      i,
      originX: e.clientX,
      range: box * DRAG_RANGE,
      dead: e.pointerType === 'mouse' ? 0 : TOUCH_DEAD_PX,
      offset: 0,
    };
    // A touch has no hover: this is the first the planet has heard of it.
    if (!preview) startPreview(i);
  }

  function dragPlan(e: PointerEvent) {
    if (!plan) return;
    const dx = e.clientX - plan.originX;
    plan.offset = Math.abs(dx) < plan.dead ? 0 : dx / plan.range;
  }

  function commitPlan() {
    const to = planned;
    plan = null;
    if (to) startTravel(to);
  }

  function cancelPlan() {
    plan = null;
  }

  // Travelling: baseTime runs forward at TIME_SCALE until it reaches the
  // arrival moment, and the ship slides along the straight route to meet
  // the planet. The hover preview is frozen at the arrival moment for the
  // duration (previewProgress pinned at 1), then everything clears.
  type Travel = { from: Point; fromTime: number; to: Planned };
  let travel = $state<Travel | null>(null);
  let travelFrame: number | null = null;

  function startTravel(to: Planned) {
    cancelPreviewLoop();
    previewProgress = 1;
    travel = { from: { x: ship.x, y: ship.y }, fromTime: baseTime, to };
    ship.heading = headingBetween(ship, to);

    const rate = TIME_SCALE * (reducedMotion() ? REDUCED_SPEEDUP : 1);

    let last = performance.now();
    const step = (now: number) => {
      const t = travel!;
      baseTime = Math.min(t.to.at, baseTime + ((now - last) / 1000) * rate);
      last = now;
      const progress = (baseTime - t.fromTime) / (t.to.at - t.fromTime);
      ship.x = t.from.x + (t.to.x - t.from.x) * progress;
      ship.y = t.from.y + (t.to.y - t.from.y) * progress;
      if (baseTime < t.to.at) travelFrame = requestAnimationFrame(step);
      else arrive();
    };
    travelFrame = requestAnimationFrame(step);
  }

  function arrive() {
    const t = travel!;
    baseTime = t.to.at;
    ship = { x: t.to.x, y: t.to.y, heading: t.to.heading };
    coneAngle = t.to.coneAngle;
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
    coneAngle = CONE_ANGLE;
    ship = { ...SHIP_START };
  }

  onDestroy(() => { cancelPreviewLoop(); cancelTravelLoop(); });
</script>

<div class="star-system">
<DitherSvg viewBox="-5 -5 10 10">

  <!-- Same frame as the ship path: apex on the nose, opening along the
       heading. While a move is being planned the cone shown is the one the
       ship would have after the fly-by, from where it would be. -->
  {#if ghostShip}
    <DitherLayer level={CONE_LEVEL}>
      <path
        transform="translate({ghostShip.x} {ghostShip.y}) rotate({ghostShip.heading})"
        d={conePath(ghostShip.coneAngle, CONE_LENGTH)} />
    </DitherLayer>
  {:else if !plan}
    <DitherLayer level={CONE_LEVEL}>
      <path
        transform="translate({ship.x} {ship.y}) rotate({ship.heading})"
        d={conePath(coneAngle, CONE_LENGTH)} />
    </DitherLayer>
  {/if}

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

  {#if routeEnd}
    <DitherLayer level={ROUTE_LEVEL}>
      <line
        x1={ship.x} y1={ship.y} x2={routeEnd.x} y2={routeEnd.y}
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
        style:cursor={intercepts[i]?.visitable ? 'pointer' : 'default'}
        onpointerenter={() => startPreview(i)}
        onpointerleave={endPreview}
        onpointerdown={(e) => beginPlan(e, i)}
        onpointermove={dragPlan}
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
