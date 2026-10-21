import { describe, it, expect, vi, beforeEach } from 'vitest';

const load = vi.fn();
let player: any;

beforeEach(() => {
  load.mockClear();
  player = Object.assign(document.createElement('div'), { load });
  // Ruffle's real entry point sets window.RufflePlayer.newest(); the loader
  // replaces window.RufflePlayer.config before importing, so keep both.
  (window as any).RufflePlayer = undefined;
  vi.doMock('@ruffle-rs/ruffle', () => {
    (window as any).RufflePlayer.newest = () => ({ createPlayer: () => player });
    return {};
  });
});

describe('loadRufflePlayer', () => {
  it('scales the game to fit the stage, even one that asks for no scaling', async () => {
    vi.resetModules();
    const { loadRufflePlayer: fresh } = await import('./ruffle-loader');
    await fresh('/game.swf', document.createElement('div'));
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0]![0]).toMatchObject({ url: '/game.swf', scale: 'showAll', forceScale: true });
  });
});
