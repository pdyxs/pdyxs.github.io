<script lang="ts">
  // Dev-only tuning panel (issue #212). It owns no state: it shows the island's
  // `tuning` and hands back a replacement through `onchange`.
  import { defaultTuning, type StopRule, type Tuning } from './sim/tuning';

  const { tuning, onchange }: { tuning: Tuning; onchange: (t: Tuning) => void } = $props();

  type NumericKey = {
    [K in keyof Tuning]: Tuning[K] extends number ? K : never;
  }[keyof Tuning];

  // [key, min, max, step]. The ranges are guesses wide enough to hand-tune in.
  const SLIDERS: [NumericKey, number, number, number][] = [
    ['massScale', 0, 1, 0.01],
    ['gravitySoftening', 0.01, 1, 0.01],
    ['turnRadius', 0.1, 5, 0.05],
    ['turnCap', 0, 180, 1],
    ['shipSpeed', 0.1, 10, 0.1],
    ['keepFactor', 0, 3, 0.05],
    ['encounterStart', 0.1, 5, 0.1],
    ['encounterStep', 0.001, 0.05, 0.001],
    ['slingshotRadius', 0.1, 5, 0.05],
    ['dragRange', 0.05, 1, 0.01],
    ['maxOffset', 0.1, 5, 0.05],
    ['defaultCommit', 0, 1, 0.01],
    ['touchDeadPx', 0, 40, 1],
  ];

  const MODES = [
    ['constant', 'Constant length'],
    ['distance', 'Per unit distance'],
    ['none', 'No stop'],
  ] as const;

  const set = (key: NumericKey, value: number) => onchange({ ...tuning, [key]: value });
  const setStop = (stopRule: StopRule) => onchange({ ...tuning, stopRule });

  function chooseMode(mode: StopRule['mode']) {
    if (mode === 'constant') setStop({ mode, length: defaultTuning.stopRule.mode === 'constant' ? defaultTuning.stopRule.length : 0.5 });
    else if (mode === 'distance') setStop({ mode, perUnit: 0.5 });
    else setStop({ mode });
  }

  const reset = () => onchange({ ...defaultTuning });
</script>

<div class="star-tune">
  <h3 class="star-tune-title">Tuning</h3>

  {#each SLIDERS as [key, min, max, step] (key)}
    <label class="star-tune-row">
      <span class="star-tune-name">{key}</span>
      <input data-tune={key} type="range" {min} {max} {step} value={tuning[key]}
        oninput={(e) => set(key, e.currentTarget.valueAsNumber)} />
      <output class="star-tune-value">{tuning[key]}</output>
    </label>
  {/each}

  <fieldset class="star-tune-stop">
    <legend class="star-tune-name">stopRule</legend>
    {#each MODES as [mode, label]}
      <label class="star-tune-radio">
        <input type="radio" name="star-tune-stop" value={mode}
          checked={tuning.stopRule.mode === mode} onchange={() => chooseMode(mode)} />
        {label}
      </label>
    {/each}
    {#if tuning.stopRule.mode === 'constant'}
      <label class="star-tune-row">
        <span class="star-tune-name">length</span>
        <input data-tune="stopLength" type="range" min="0" max="5" step="0.05"
          value={tuning.stopRule.length}
          oninput={(e) => setStop({ mode: 'constant', length: e.currentTarget.valueAsNumber })} />
        <output class="star-tune-value">{tuning.stopRule.length}</output>
      </label>
    {:else if tuning.stopRule.mode === 'distance'}
      <label class="star-tune-row">
        <span class="star-tune-name">perUnit</span>
        <input data-tune="stopPerUnit" type="range" min="0" max="5" step="0.05"
          value={tuning.stopRule.perUnit}
          oninput={(e) => setStop({ mode: 'distance', perUnit: e.currentTarget.valueAsNumber })} />
        <output class="star-tune-value">{tuning.stopRule.perUnit}</output>
      </label>
    {/if}
  </fieldset>

  <button class="star-tune-reset" type="button" onclick={reset}>Reset to defaults</button>
</div>

<style>
  /* Below the dithered box, in flow: a sibling of it, never a wrapper. */
  .star-tune {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    margin-top: var(--space-sm);
    padding: var(--space-sm);
    background: var(--color-bg);
    color: var(--color-text);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius);
    font-family: var(--font-ui);
    font-size: 0.8rem;
  }

  .star-tune-title {
    margin: 0;
    font-size: 0.9rem;
  }

  .star-tune-row {
    display: grid;
    grid-template-columns: 9rem 1fr 4rem;
    align-items: center;
    gap: var(--space-sm);
  }

  .star-tune-value {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .star-tune-stop {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    margin: 0;
    padding: var(--space-xs);
    border: var(--border-width) solid var(--color-border);
  }

  .star-tune-reset {
    align-self: flex-start;
    padding: var(--space-xs) var(--space-sm);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-bg);
    color: var(--color-text);
    font-family: inherit;
    font-size: inherit;
    cursor: pointer;
  }

  .star-tune-reset:hover {
    background: var(--color-bg-hover);
  }
</style>
