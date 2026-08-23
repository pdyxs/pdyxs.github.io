import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { waitForTransition } from './transition-wait';

/** happy-dom has no TransitionEvent constructor; the property is what matters. */
function transitionEnd(property: string): Event {
  const event = new Event('transitionend');
  Object.defineProperty(event, 'propertyName', { value: property });
  return event;
}

let el: HTMLElement;

beforeEach(() => {
  vi.useFakeTimers();
  el = document.createElement('div');
  document.body.appendChild(el);
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('waitForTransition', () => {
  it('resolves when the transition it is waiting for ends', async () => {
    let done = false;
    const wait = waitForTransition(el, 'grid-template-rows', 400).then(() => { done = true; });

    el.dispatchEvent(transitionEnd('grid-template-rows'));
    await wait;

    expect(done).toBe(true);
  });

  it('ignores a transitionend for any other property', async () => {
    let done = false;
    waitForTransition(el, 'grid-template-rows', 400).then(() => { done = true; });

    // The global reset transitions colour on every element, so these really do
    // arrive on the same node during a collapse.
    el.dispatchEvent(transitionEnd('background-color'));
    el.dispatchEvent(transitionEnd('color'));
    await Promise.resolve();

    expect(done).toBe(false);
  });

  it('resolves via the fallback when no event ever arrives', async () => {
    let done = false;
    const wait = waitForTransition(el, 'grid-template-rows', 400).then(() => { done = true; });

    await vi.advanceTimersByTimeAsync(399);
    expect(done).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await wait;
    expect(done).toBe(true);
  });

  it('clears the fallback timer when the event wins', async () => {
    // THE BUG (#104). The promise cannot show it — a settled promise ignores a
    // second resolve — so the pending timer is what has to be asserted. Left
    // uncleared, a transition slower than the fallback resolved twice and left
    // a timer to fire into a wait nobody was holding any more.
    const wait = waitForTransition(el, 'grid-template-rows', 400);
    expect(vi.getTimerCount()).toBe(1);

    el.dispatchEvent(transitionEnd('grid-template-rows'));
    await wait;

    expect(vi.getTimerCount()).toBe(0);
  });

  it('removes the listener when the fallback wins', async () => {
    const remove = vi.spyOn(el, 'removeEventListener');

    const wait = waitForTransition(el, 'grid-template-rows', 400);
    await vi.advanceTimersByTimeAsync(400);
    await wait;

    expect(remove).toHaveBeenCalledWith('transitionend', expect.any(Function));
  });

  it('settles exactly once however the two race', async () => {
    let resolutions = 0;
    const wait = waitForTransition(el, 'grid-template-rows', 400).then(() => { resolutions++; });

    // Both halves fire, in both orders, plus a repeat of each.
    el.dispatchEvent(transitionEnd('grid-template-rows'));
    await vi.advanceTimersByTimeAsync(400);
    el.dispatchEvent(transitionEnd('grid-template-rows'));
    await wait;

    expect(resolutions).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
