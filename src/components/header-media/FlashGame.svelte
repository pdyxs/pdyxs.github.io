<script lang="ts">
  import { loadRufflePlayer, type PlayerLoader } from '../../lib/flash/ruffle-loader';

  interface Props {
    swfUrl: string;
    /** Stage size in pixels, from the SWF header. Only the ratio matters. */
    width: number;
    height: number;
    poster?: { src: string; width: number; height: number };
    /** Injected in tests so they never load WASM. */
    loadPlayer?: PlayerLoader;
  }

  let { swfUrl, width, height, poster, loadPlayer = loadRufflePlayer }: Props = $props();

  let stage: HTMLElement;
  let playerHost: HTMLElement;
  let started = $state(false);

  async function play() {
    started = true;
    await loadPlayer(swfUrl, playerHost);
  }

  function fullscreen() {
    stage.requestFullscreen?.();
  }
</script>

<div class="flash-game">
  <div class="flash-stage" bind:this={stage} style="--flash-aspect: {width} / {height}">
    <div class="flash-player" bind:this={playerHost}></div>
    {#if !started}
      {#if poster}
        <img class="flash-poster" src={poster.src} width={poster.width} height={poster.height} alt="" />
      {/if}
      <button type="button" class="flash-play" onclick={play} aria-label="Play game">&#9654;</button>
    {/if}
  </div>
  <button type="button" class="flash-fullscreen" onclick={fullscreen} aria-label="Fullscreen">Fullscreen</button>
</div>

<style>
  .flash-game {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-xs);
  }
  .flash-stage {
    position: relative;
    width: 100%;
    aspect-ratio: var(--flash-aspect);
    background: var(--color-text);
  }
  .flash-player,
  .flash-poster {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .flash-play {
    position: absolute;
    left: 50%;
    top: 50%;
    translate: -50% -50%;
    padding: var(--space-md) var(--space-lg);
    font: inherit;
    font-size: 2rem;
    background: var(--color-bg);
    color: var(--color-text);
    border: 2px solid var(--color-border);
    cursor: pointer;
  }
  .flash-play:hover,
  .flash-play:focus-visible {
    background: var(--color-selected-bg);
    color: var(--color-selected-fg);
  }
  .flash-fullscreen {
    font: inherit;
    font-family: var(--font-ui);
    background: var(--color-bg);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    padding: var(--space-xs) var(--space-sm);
    cursor: pointer;
  }
  .flash-fullscreen:hover,
  .flash-fullscreen:focus-visible {
    background: var(--color-selected-bg);
    color: var(--color-selected-fg);
  }
</style>
