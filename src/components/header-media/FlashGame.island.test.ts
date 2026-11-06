import { readFileSync } from 'node:fs';
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import FlashGame from '@components/header-media/FlashGame.svelte';

let target: HTMLElement;
let component: ReturnType<typeof mount>;
const loadPlayer = vi.fn(async (_url: string, _container: HTMLElement) => {});

beforeEach(() => {
  loadPlayer.mockClear();
  target = document.createElement('div');
  document.body.appendChild(target);
  component = mount(FlashGame as any, {
    target,
    props: {
      swfUrl: '/_astro/game.abc.swf',
      width: 800,
      height: 600,
      poster: { src: '/img/poster.png', width: 800, height: 600 },
      loadPlayer,
    },
  });
  flushSync();
});

afterEach(() => {
  unmount(component);
  target.remove();
});

const q = <T extends Element = HTMLElement>(sel: string) => target.querySelector<T>(sel);

describe('FlashGame', () => {
  it('shows the poster and a play button at the SWF aspect ratio, without loading anything', () => {
    expect(q('.flash-poster')!.getAttribute('src')).toBe('/img/poster.png');
    expect(q('.flash-play')).not.toBeNull();
    expect(q('.flash-stage')!.getAttribute('style')).toContain('--flash-aspect: 800 / 600');
    expect(loadPlayer).not.toHaveBeenCalled();
  });

  it('loads the SWF into the stage on play and drops the poster', async () => {
    q('.flash-play')!.click();
    flushSync();
    expect(loadPlayer).toHaveBeenCalledTimes(1);
    expect(loadPlayer.mock.calls[0]![0]).toBe('/_astro/game.abc.swf');
    expect(loadPlayer.mock.calls[0]![1]).toBe(q('.flash-player'));
    expect(q('.flash-play')).toBeNull();
    expect(q('.flash-poster')).toBeNull();
  });

  it('goes back to the poster and play button, with a message, when the player fails to load', async () => {
    const failing = vi.fn(async () => {
      throw new TypeError('error loading dynamically imported module');
    });
    unmount(component);
    component = mount(FlashGame as any, {
      target,
      props: {
        swfUrl: '/_astro/game.abc.swf',
        width: 800,
        height: 600,
        poster: { src: '/img/poster.png', width: 800, height: 600 },
        loadPlayer: failing,
      },
    });
    flushSync();
    q('.flash-play')!.click();
    await vi.waitFor(() => expect(q('.flash-error')).not.toBeNull());
    expect(q('.flash-error')!.getAttribute('role')).toBe('alert');
    expect(q('.flash-poster')).not.toBeNull();
    expect(q('.flash-play')).not.toBeNull();
  });

  it('offers fullscreen on the stage', () => {
    const stage = q('.flash-stage')!;
    stage.requestFullscreen = vi.fn(async () => {});
    q('.flash-fullscreen')!.click();
    expect(stage.requestFullscreen).toHaveBeenCalled();
  });

  it('plays a bare SWF URL with no poster, as the comparison pages use it', () => {
    unmount(component);
    component = mount(FlashGame as any, {
      target,
      props: { swfUrl: '/experiments/houston/p1/houston.swf', width: 1024, height: 768, loadPlayer },
    });
    flushSync();
    expect(q('.flash-poster')).toBeNull();
    expect(q('.flash-stage')!.getAttribute('style')).toContain('--flash-aspect: 1024 / 768');
    q('.flash-play')!.click();
    flushSync();
    expect(loadPlayer.mock.calls[0]![0]).toBe('/experiments/houston/p1/houston.swf');
  });

  // happy-dom does no layout, so the fullscreen geometry is pinned at the CSS
  // source, as the repo's other style tests do. Issue #219: the player sat in the
  // top-left of the fullscreen box, leaving a black band on the right.
  it('centres the player in the fullscreen stage', () => {
    const src = readFileSync('src/components/header-media/FlashGame.svelte', 'utf8');
    const rule = (sel: string) => src.match(new RegExp(sel.replace(/[.:]/g, '\\$&') + '\\s*\\{([^}]*)\\}'))?.[1] ?? '';
    expect(rule('.flash-stage:fullscreen')).toMatch(/display:\s*grid/);
    expect(rule('.flash-stage:fullscreen')).toMatch(/place-items:\s*center/);
    expect(rule('.flash-stage:fullscreen .flash-player')).toMatch(/position:\s*relative/);
    expect(rule('.flash-stage:fullscreen .flash-player')).toMatch(/aspect-ratio:\s*var\(--flash-aspect\)/);
  });
});
