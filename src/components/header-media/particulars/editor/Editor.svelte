<script lang="ts">
  // Dev-only Particulars editor. One scenario store; the form dispatches Edits
  // into it and renders from it, and the preview mounts the same Toy the card
  // page does. Disk writes go through the dev-server endpoint, debounced, and
  // only for scenarios that validate.
  import { onMount } from 'svelte';
  import Toy from '../Toy.svelte';
  import LevelView from './LevelView.svelte';
  import { createScenarioStore } from '../../../../lib/particulars/editor/store';
  import type { Edit, Path } from '../../../../lib/particulars/editor/edit';
  import { triggersForWave } from '../../../../lib/particulars/editor/waves';
  import { BLANK_SCENARIO } from '../../../../lib/particulars/editor/new-card';
  import type { Selection } from '../../../../lib/particulars/editor/selection';
  import { isolateWaves } from '../../../../lib/particulars/sim/isolate';
  import { validate } from '../../../../lib/particulars/scenario/validate';
  import { FORCE_NAMES, PARTICLE_TYPES } from '../../../../lib/particulars/scenario/types';
  import type { Scenario } from '../../../../lib/particulars/scenario/types';

  const API = '/__particulars';
  let { saveDelayMs = 400 }: { saveDelayMs?: number } = $props();

  const store = createScenarioStore(BLANK_SCENARIO);
  let scenario = $state.raw<Scenario>(store.get());
  store.subscribe((s) => (scenario = s));

  let cards = $state<{ dir: string; hasScenario: boolean }[]>([]);
  let current = $state<string | null>(null);
  let status = $state('');
  let newDir = $state('what/toys/');
  let newTitle = $state('');
  // Level view state: what is selected for handle editing, and which waves are ticked to run.
  let selection = $state<Selection>(null);
  let runChoice = $state<string[]>([]);
  // `waves: null` plays the whole scenario; `n` restarts a run that is pressed again.
  let running = $state<{ waves: string[] | null; n: number } | null>(null);
  const MAX_RUN_WAVES = 2;
  function chooseRun(id: string, on: boolean) {
    runChoice = on ? [...runChoice.filter((w) => w !== id), id] : runChoice.filter((w) => w !== id);
  }
  const startRun = (waves: string[] | null) => (running = { waves, n: (running?.n ?? 0) + 1 });

  const result = $derived(validate(scenario));
  const errors = $derived(result.ok ? [] : result.errors);
  const waves = $derived(scenario.waves ?? []);
  const claimed = $derived(new Set(waves.flatMap((w) => triggersForWave(scenario, w.id).map((t) => t.index))));
  const fieldName = (path: Path) => path.join('.');

  async function call(url: string, init?: RequestInit) {
    const res = await fetch(url, init);
    return { ok: res.ok, body: await res.json() };
  }
  const scenarioUrl = (dir: string) => `${API}/scenario?path=${encodeURIComponent(`${dir}/index.json`)}`;

  async function refreshCards() {
    const r = await call(`${API}/cards`);
    if (r.ok) cards = r.body;
  }
  onMount(refreshCards);

  async function open(dir: string) {
    if (!dir) return;
    const r = await call(scenarioUrl(dir));
    if (!r.ok) {
      status = `Could not open ${dir}: ${r.body.error}`;
      return;
    }
    current = dir;
    selection = null;
    running = null;
    runChoice = [];
    store.replace(r.body);
    status = `Opened ${dir}`;
  }

  async function create() {
    const r = await call(`${API}/create`, {
      method: 'POST',
      body: JSON.stringify({ dir: newDir, title: newTitle }),
    });
    if (!r.ok) {
      status = `Could not create: ${r.body.error}`;
      return;
    }
    await refreshCards();
    await open(newDir);
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  function edit(e: Edit) {
    store.dispatch(e);
    clearTimeout(timer);
    status = 'Unsaved changes';
    timer = setTimeout(save, saveDelayMs);
  }
  async function save() {
    const s = store.get();
    if (!current || !validate(s).ok) return;
    status = 'Saving…';
    const r = await call(scenarioUrl(current), { method: 'PUT', body: JSON.stringify(s) });
    status = r.ok ? `Saved ${current}/index.json` : `Save failed: ${r.body.error}`;
  }

  // Input helpers: the form speaks Edits, the format stays plain JSON.
  function setNumber(path: Path, e: Event, optional = false) {
    const raw = (e.currentTarget as HTMLInputElement).value;
    if (raw === '' && optional) return edit({ kind: 'remove', path });
    const n = Number(raw);
    if (raw !== '' && Number.isFinite(n)) edit({ kind: 'set', path, value: n });
  }
  const setText = (path: Path, e: Event) => edit({ kind: 'set', path, value: (e.currentTarget as HTMLInputElement | HTMLSelectElement).value });
  function setJson(path: Path, e: Event) {
    const el = e.currentTarget as HTMLTextAreaElement;
    try {
      edit({ kind: 'set', path, value: JSON.parse(el.value) });
      el.removeAttribute('aria-invalid');
    } catch {
      el.setAttribute('aria-invalid', 'true');
    }
  }
  function setRef(path: Path, e: Event) {
    const raw = (e.currentTarget as HTMLInputElement).value.trim();
    if (!raw.startsWith('{')) return edit({ kind: 'set', path, value: raw });
    try {
      edit({ kind: 'set', path, value: JSON.parse(raw) });
    } catch {
      /* keep typing */
    }
  }
  const refText = (ref: unknown) => (typeof ref === 'string' ? ref : JSON.stringify(ref));
  const pretty = (v: unknown) => JSON.stringify(v, null, 1);
  const formations = $derived(Object.entries(scenario.formations ?? {}));
</script>

{#snippet num(label: string, path: Path, value: number | undefined, optional = false)}
  <label>{label}
    <input type="number" step="any" data-field={fieldName(path)} value={value ?? ''} oninput={(e) => setNumber(path, e, optional)} />
  </label>
{/snippet}

{#snippet json(label: string, path: Path, value: unknown)}
  <label class="json">{label}
    <textarea data-field={fieldName(path)} rows="3" value={pretty(value)} onchange={(e) => setJson(path, e)}></textarea>
  </label>
{/snippet}

<div class="editor">
  <h1>Particulars editor</h1>

  <section class="cards">
    <label>Card
      <select class="card-picker" onchange={(e) => open(e.currentTarget.value)}>
        <option value="">Pick a card…</option>
        {#each cards as c (c.dir)}
          <option value={c.dir} selected={c.dir === current}>{c.dir}{c.hasScenario ? '' : ' (no scenario yet)'}</option>
        {/each}
      </select>
    </label>
    <fieldset>
      <legend>New card</legend>
      <label>Folder <input data-field="new.dir" bind:value={newDir} /></label>
      <label>Title <input data-field="new.title" bind:value={newTitle} /></label>
      <button type="button" class="create" onclick={create}>Create</button>
    </fieldset>
    <p class="status" role="status">{status}</p>
  </section>

  {#if current}
    {#if errors.length > 0}
      <ul class="errors">
        {#each errors as err (err)}<li>{err}</li>{/each}
      </ul>
    {/if}

    <div class="columns">
      <form class="form" onsubmit={(e) => e.preventDefault()}>
        <fieldset>
          <legend>Box</legend>
          {@render num('Width', ['walls', 'width'], scenario.walls.width)}
          {@render num('Height', ['walls', 'height'], scenario.walls.height)}
        </fieldset>

        <fieldset>
          <legend>Player</legend>
          {@render num('x', ['player', 'x'], scenario.player.x)}
          {@render num('y', ['player', 'y'], scenario.player.y)}
          <label>Particle
            <select data-field="player.particle.type" onchange={(e) => edit({ kind: 'set', path: ['player', 'particle'], value: { ...(scenario.player.particle ?? {}), type: e.currentTarget.value } })}>
              {#each PARTICLE_TYPES as t (t)}
                <option value={t} selected={(scenario.player.particle?.type ?? 'down') === t}>{t}</option>
              {/each}
            </select>
          </label>
        </fieldset>

        <fieldset>
          <legend>Forces</legend>
          {#each FORCE_NAMES as f (f)}
            <label class="inline">
              <input type="checkbox" data-field={`forces.${f}`} checked={scenario.forces?.[f] ?? false} onchange={(e) => edit({ kind: 'set', path: ['forces', f], value: e.currentTarget.checked })} />
              {f}
            </label>
          {/each}
        </fieldset>

        <fieldset>
          <legend>Black holes</legend>
          {#each scenario.blackHoles ?? [] as h, i (i)}
            <div class="row">
              {@render num('x', ['blackHoles', i, 'x'], h.x)}
              {@render num('y', ['blackHoles', i, 'y'], h.y)}
              {@render num('mass', ['blackHoles', i, 'mass'], h.mass)}
              <button type="button" onclick={() => edit({ kind: 'remove', path: ['blackHoles', i] })}>Remove</button>
            </div>
          {/each}
          <button type="button" onclick={() => edit({ kind: 'insert', path: ['blackHoles'], value: { x: 0, y: 0, mass: 1 } })}>Add black hole</button>
        </fieldset>

        <fieldset>
          <legend>Barriers (JSON)</legend>
          {#each scenario.barriers ?? [] as b, i (i)}
            <div class="row">
              {@render json(`Barrier ${i + 1}`, ['barriers', i], b)}
              <button type="button" data-select={`barrier-${i}`} onclick={() => (selection = { kind: 'wall', index: i })}>Select</button>
              <button type="button" onclick={() => edit({ kind: 'remove', path: ['barriers', i] })}>Remove</button>
            </div>
          {/each}
          <button type="button" onclick={() => edit({ kind: 'insert', path: ['barriers'], value: { shape: 'rect', mode: 'all', x: 0, y: 0, width: 2, height: 0.4 } })}>Add barrier</button>
        </fieldset>

        <fieldset>
          <legend>Formations (JSON)</legend>
          {#each formations as [name, f] (name)}
            <div class="row">
              {@render json(name, ['formations', name], f)}
              <button type="button" onclick={() => edit({ kind: 'remove', path: ['formations', name] })}>Remove</button>
            </div>
          {/each}
          <button type="button" onclick={() => edit({ kind: 'insert', path: ['formations', `formation-${formations.length + 1}`], value: { kind: 'single', contents: ['electron'] } })}>Add formation</button>
        </fieldset>

        <fieldset class="waves">
          <legend>Waves</legend>
          {#each waves as w, wi (wi)}
            <fieldset class="wave">
              <legend>{w.id}</legend>
              <div class="row">
                <label>Id <input data-field={`waves.${wi}.id`} value={w.id} onchange={(e) => edit({ kind: 'rename-wave', from: w.id, to: e.currentTarget.value })} /></label>
                <label class="inline"><input type="checkbox" data-run-wave={w.id} checked={runChoice.includes(w.id)} disabled={!runChoice.includes(w.id) && runChoice.length >= MAX_RUN_WAVES} onchange={(e) => chooseRun(w.id, e.currentTarget.checked)} /> run</label>
                <button type="button" disabled={wi === 0} onclick={() => edit({ kind: 'move', path: ['waves'], from: wi, to: wi - 1 })}>Up</button>
                <button type="button" disabled={wi === waves.length - 1} onclick={() => edit({ kind: 'move', path: ['waves'], from: wi, to: wi + 1 })}>Down</button>
                <button type="button" onclick={() => edit({ kind: 'remove', path: ['waves', wi] })}>Remove wave</button>
              </div>

              {#each triggersForWave(scenario, w.id) as { index, trigger } (index)}
                <div class="row trigger">
                  {#if trigger.kind === 'time'}
                    {@render num('Fires at (s)', ['triggers', index, 'at'], trigger.at)}
                    {@render num('every', ['triggers', index, 'every'], trigger.every, true)}
                    {@render num('repeats', ['triggers', index, 'repeats'], trigger.repeats, true)}
                  {:else}
                    <label>Button <input data-field={`triggers.${index}.button`} value={trigger.button} onchange={(e) => setText(['triggers', index, 'button'], e)} /></label>
                  {/if}
                  <button type="button" onclick={() => edit({ kind: 'remove', path: ['triggers', index] })}>Remove trigger</button>
                </div>
              {/each}
              <button type="button" onclick={() => edit({ kind: 'insert', path: ['triggers'], value: { kind: 'time', at: 0, actions: [{ kind: 'spawn', wave: w.id }] } })}>Add timed trigger</button>

              {#each w.entries as entry, ei (ei)}
                <div class="row entry">
                  <label>Spawn <input data-field={`waves.${wi}.entries.${ei}.spawn`} value={refText(entry.spawn)} onchange={(e) => setRef(['waves', wi, 'entries', ei, 'spawn'], e)} /></label>
                  {@render num('x', ['waves', wi, 'entries', ei, 'position', 'x'], entry.position?.x, true)}
                  {@render num('y', ['waves', wi, 'entries', ei, 'position', 'y'], entry.position?.y, true)}
                  {@render num('angle', ['waves', wi, 'entries', ei, 'angle'], entry.angle, true)}
                  {@render num('telegraph', ['waves', wi, 'entries', ei, 'telegraph'], entry.telegraph, true)}
                  {@render json('velocity', ['waves', wi, 'entries', ei, 'velocity'], entry.velocity ?? { magnitude: 0 })}
                  <button type="button" data-select={`entry-${wi}-${ei}`} data-selected={selection?.kind === 'entry' && selection.wave === wi && selection.entry === ei} onclick={() => (selection = { kind: 'entry', wave: wi, entry: ei })}>Select</button>
                  <button type="button" onclick={() => edit({ kind: 'remove', path: ['waves', wi, 'entries', ei] })}>Remove entry</button>
                </div>
              {/each}
              <button type="button" onclick={() => edit({ kind: 'insert', path: ['waves', wi, 'entries'], value: { spawn: 'electron' } })}>Add entry</button>
            </fieldset>
          {/each}
          <button type="button" onclick={() => edit({ kind: 'insert', path: ['waves'], value: { id: `wave-${waves.length + 1}`, entries: [{ spawn: 'electron' }] } })}>Add wave</button>
        </fieldset>

        {#if (scenario.triggers ?? []).some((_, i) => !claimed.has(i))}
          <fieldset>
            <legend>Other triggers (JSON)</legend>
            {#each scenario.triggers ?? [] as t, i (i)}
              {#if !claimed.has(i)}
                <div class="row">
                  {@render json(`Trigger ${i + 1}`, ['triggers', i], t)}
                  <button type="button" onclick={() => edit({ kind: 'remove', path: ['triggers', i] })}>Remove</button>
                </div>
              {/if}
            {/each}
          </fieldset>
        {/if}
      </form>

      <div class="preview">
        {#if result.ok}
          <div class="run-bar">
            <button type="button" class="run-waves" disabled={runChoice.length === 0} onclick={() => startRun(runChoice)}>Run {runChoice.length === 1 ? 'wave' : 'waves'} in isolation</button>
            <button type="button" class="play-all" onclick={() => startRun(null)}>Play whole level</button>
            {#if running}<button type="button" class="stop-run" onclick={() => (running = null)}>Stop</button>{/if}
          </div>
          {#if running}
            {#key running.n}
              <Toy entryId={current} scenario={running.waves ? isolateWaves(result.scenario, running.waves) : result.scenario} />
            {/key}
          {:else}
            <LevelView entryId={current} {scenario} {selection} onedit={edit} onselect={(s) => (selection = s)} />
          {/if}
        {:else}
          <p>Fix the errors to resume the preview.</p>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .editor {
    padding: var(--space-md);
  }
  .columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--space-md);
    align-items: start;
  }
  .preview {
    position: sticky;
    top: var(--space-sm);
  }
  .run-bar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    margin-block-end: var(--space-sm);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    align-items: end;
  }
  fieldset {
    margin-block: var(--space-sm);
    border: var(--border-width) solid var(--color-border);
  }
  label {
    display: inline-flex;
    flex-direction: column;
    font-size: 0.85em;
  }
  label.inline {
    flex-direction: row;
    gap: var(--space-xs);
  }
  input[type='number'] {
    width: 6em;
  }
  textarea {
    font-family: monospace;
    min-width: 18em;
  }
  :global(textarea[aria-invalid='true']) {
    outline: 2px dashed var(--color-text);
  }
  .errors {
    border: var(--border-width) dashed var(--color-text);
    padding: var(--space-sm) var(--space-md);
  }
</style>
