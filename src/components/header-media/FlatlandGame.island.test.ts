import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import FlatlandGame from '@components/header-media/FlatlandGame.svelte';

let target: HTMLElement;
let component: ReturnType<typeof mount>;

beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
  component = mount(FlatlandGame as any, {
    target,
    props: { poster: { src: '/img/poster.jpg', width: 1280, height: 1024 } },
  });
  flushSync();
});

afterEach(() => {
  unmount(component);
  target.remove();
});

const q = <T extends Element = HTMLElement>(sel: string) => target.querySelector<T>(sel);

describe('FlatlandGame', () => {
  it('shows the poster and a play button, loading no iframe', () => {
    expect(q('.flatland-poster')!.getAttribute('src')).toBe('/img/poster.jpg');
    expect(q('.flatland-play')).not.toBeNull();
    expect(q('iframe')).toBeNull();
  });

  it('swaps the poster for the game iframe on play', () => {
    q('.flatland-play')!.click();
    flushSync();
    const frame = q<HTMLIFrameElement>('iframe')!;
    expect(frame.getAttribute('src')).toBe('/games/flatland/index.html');
    expect(frame.getAttribute('allow')).toBe('fullscreen; autoplay');
    expect(q('.flatland-poster')).toBeNull();
    expect(q('.flatland-play')).toBeNull();
  });

  it('offers fullscreen on the stage', () => {
    const stage = q('.flatland-stage')!;
    stage.requestFullscreen = vi.fn(async () => {});
    q('.flatland-fullscreen')!.click();
    expect(stage.requestFullscreen).toHaveBeenCalled();
  });

  it('plays with no poster', () => {
    unmount(component);
    component = mount(FlatlandGame as any, { target, props: {} });
    flushSync();
    expect(q('.flatland-poster')).toBeNull();
    q('.flatland-play')!.click();
    flushSync();
    expect(q('iframe')).not.toBeNull();
  });
});
