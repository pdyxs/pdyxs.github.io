<script lang="ts">
  interface Props {
    poster?: { src: string; width: number; height: number };
  }

  let { poster }: Props = $props();

  /** The web port's index.html, fetched into public/ by scripts/fetch-flatland.mjs. */
  const GAME_URL = '/games/flatland/index.html';

  let stage: HTMLElement;
  let started = $state(false);

  function fullscreen() {
    stage.requestFullscreen?.();
  }
</script>

<div class="flatland-game">
  <div class="flatland-stage" bind:this={stage}>
    {#if started}
      <iframe class="flatland-frame" src={GAME_URL} title="Flatland: Fallen Angle" allow="fullscreen; autoplay"></iframe>
    {:else}
      {#if poster}
        <img class="flatland-poster" src={poster.src} width={poster.width} height={poster.height} alt="" />
      {/if}
      <button type="button" class="flatland-play" onclick={() => (started = true)} aria-label="Play game">&#9654;</button>
    {/if}
  </div>
  <button type="button" class="flatland-fullscreen" onclick={fullscreen} aria-label="Fullscreen">Fullscreen</button>
</div>

<style>
  .flatland-game {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-xs);
  }
  /* The game is 4:3 whatever the poster's shape. */
  .flatland-stage {
    --flatland-aspect: 4 / 3;
    position: relative;
    width: 100%;
    aspect-ratio: var(--flatland-aspect);
    background: var(--color-text);
  }
  .flatland-frame,
  .flatland-poster {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
    object-fit: cover;
  }
  .flatland-play {
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
  .flatland-fullscreen {
    font: inherit;
    font-family: var(--font-ui);
    background: var(--color-bg);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    padding: var(--space-xs) var(--space-sm);
    cursor: pointer;
  }
  .flatland-play:hover,
  .flatland-play:focus-visible,
  .flatland-fullscreen:hover,
  .flatland-fullscreen:focus-visible {
    background: var(--color-selected-bg);
    color: var(--color-selected-fg);
  }
</style>
