<script lang="ts">
  // The level as the editor draws it: the box, barriers, black holes, the player
  // and, for the selected wave entry, the spawn points `expand()` yields, with the
  // selection's handles on top. It holds no scenario state: a drag turns into an
  // Edit through the pure dragEdit() and goes up to the one store.
  import { arcPath } from '../wall-path';
  import { expand } from '../../../../lib/particulars/scenario/expand';
  import { clientToWorld } from '../../../../lib/particulars/input/pointer';
  import { editorHandles, dragEdit } from '../../../../lib/particulars/editor/selection';
  import type { EditorHandle, Selection } from '../../../../lib/particulars/editor/selection';
  import type { Edit } from '../../../../lib/particulars/editor/edit';
  import type { Scenario } from '../../../../lib/particulars/scenario/types';
  import { PARTICLE_RADIUS, VIEW_MARGIN } from '../../../../lib/particulars/constants';

  let {
    scenario,
    entryId,
    selection,
    onedit,
    onselect,
  }: {
    scenario: Scenario;
    entryId: string;
    selection: Selection;
    onedit: (edit: Edit) => void;
    onselect: (selection: Selection) => void;
  } = $props();

  const view = $derived({
    x: -scenario.walls.width / 2 - VIEW_MARGIN,
    y: -scenario.walls.height / 2 - VIEW_MARGIN,
    width: scenario.walls.width + VIEW_MARGIN * 2,
    height: scenario.walls.height + VIEW_MARGIN * 2,
  });

  const handles = $derived(editorHandles(scenario, selection));
  const entry = $derived(selection?.kind === 'entry' ? scenario.waves?.[selection.wave]?.entries[selection.entry] : undefined);
  const spawns = $derived(entry ? expand(entry, scenario.formations ?? {}) : []);

  let svg: SVGSVGElement;
  // The gesture in flight: the handle and scenario as they were at pointer-down.
  let drag: { handle: EditorHandle; start: Scenario; from: { x: number; y: number } } | null = null;

  const worldPoint = (e: PointerEvent) =>
    clientToWorld({ x: e.clientX, y: e.clientY }, svg.getBoundingClientRect(), view);

  function onHandleDown(e: PointerEvent, handle: EditorHandle) {
    e.stopPropagation();
    drag = { handle, start: scenario, from: worldPoint(e) };
    svg.setPointerCapture?.(e.pointerId);
  }
  function onMove(e: PointerEvent) {
    if (!drag) return;
    const p = worldPoint(e);
    onedit(dragEdit(drag.start, drag.handle, { x: p.x - drag.from.x, y: p.y - drag.from.y }));
  }
  const onUp = () => (drag = null);
</script>

<svg
  bind:this={svg}
  class="level-view"
  data-entry={entryId}
  viewBox="{view.x} {view.y} {view.width} {view.height}"
  role="group"
  aria-label="Level editor. Select a wave entry or barrier, then drag its handles."
  onpointermove={onMove}
  onpointerup={onUp}
  onpointercancel={onUp}
>
  <rect class="walls" x={-scenario.walls.width / 2} y={-scenario.walls.height / 2} width={scenario.walls.width} height={scenario.walls.height} />
  {#each scenario.barriers ?? [] as w, i (i)}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <g class="barrier-wrap" data-selected={selection?.kind === 'wall' && selection.index === i} onclick={() => onselect({ kind: 'wall', index: i })}>
      {#if w.shape === 'rect'}
        <rect class="barrier" data-mode={w.mode} x={w.x - w.width / 2} y={w.y - w.height / 2} width={w.width} height={w.height} transform="rotate({w.angle ?? 0} {w.x} {w.y})" />
      {:else}
        <path class="barrier" data-mode={w.mode} d={arcPath(w)} />
      {/if}
    </g>
  {/each}
  {#each scenario.blackHoles ?? [] as h, i (i)}
    <circle class="black-hole" cx={h.x} cy={h.y} r={0.4} />
  {/each}
  <circle class="player" cx={scenario.player.x} cy={scenario.player.y} r={scenario.player.radius} />
  {#each spawns as s, i (i)}
    <circle class="spawn" cx={s.x} cy={s.y} r={PARTICLE_RADIUS} data-type={s.particle.type} />
  {/each}
  {#each handles as h (h.key)}
    <circle role="button" tabindex="-1" aria-label="Drag handle {h.key}" class="handle" data-handle={h.key} cx={h.x} cy={h.y} r={0.3} onpointerdown={(e) => onHandleDown(e, h)} />
  {/each}
</svg>

<style>
  .level-view {
    display: block;
    width: 100%;
    max-height: 70vh;
    touch-action: none;
    user-select: none;
  }
  .walls,
  .barrier,
  .black-hole,
  .player,
  .spawn {
    fill: none;
    stroke: var(--color-text);
    stroke-width: 0.12;
  }
  .barrier[data-mode='all'] {
    fill: var(--color-text);
  }
  .barrier-wrap {
    cursor: pointer;
  }
  .barrier-wrap[data-selected='true'] .barrier {
    stroke-dasharray: 0.3 0.15;
  }
  .spawn {
    stroke-width: 0.06;
    stroke-dasharray: 0.15 0.15;
  }
  .player {
    fill: var(--color-text);
  }
  .handle {
    fill: var(--color-bg);
    stroke: var(--color-text);
    stroke-width: 0.1;
    cursor: grab;
  }
</style>
