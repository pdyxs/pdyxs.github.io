// The real player loader FlashGame.svelte uses unless a test injects another.
// Ruffle is imported dynamically so nothing of it (JS or WASM) is requested
// until the visitor clicks play. Self-hosted: the package is bundled from npm
// and its chunks/wasm are served from /ruffle/ (scripts/ruffle-assets-plugin.mjs).

export type PlayerLoader = (swfUrl: string, container: HTMLElement) => Promise<void>;

const CONFIG = {
  // The click that started the load is the user gesture that lets audio start.
  autoplay: 'on',
  splashScreen: false,
  unmuteOverlay: 'hidden',
  // Where Ruffle fetches its core chunks and .wasm from.
  publicPath: '/ruffle/',
  // A game that sets Stage.scaleMode = noScale (Tiny World does) is otherwise shown
  // at native pixels and cropped to whatever the stage box is. The box already
  // has the SWF's aspect ratio, so fitting the game to it is lossless.
  scale: 'showAll',
  forceScale: true,
  // Flash drew device fonts (a game that says "Georgia") with the visitor's own
  // fonts. Ruffle's default renderer instead swaps every one for its built-in
  // Noto Sans, which is the wrong face, wider (lines wrap and overlap) and
  // drops some large text altogether. 'canvas' asks the browser to draw them.
  deviceFontRenderer: 'canvas',
};

export const loadRufflePlayer: PlayerLoader = async (swfUrl, container) => {
  // Ruffle reads window.RufflePlayer.config as it initialises, so it is set first.
  (window as any).RufflePlayer = { config: CONFIG };
  await import('@ruffle-rs/ruffle');
  const player = (window as any).RufflePlayer.newest().createPlayer();
  player.style.width = '100%';
  player.style.height = '100%';
  container.appendChild(player);
  player.load({ url: swfUrl, ...CONFIG });
};
