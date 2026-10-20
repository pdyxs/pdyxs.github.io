import { afterEach, describe, expect, it, vi } from 'vitest';
import { typedViewTransitions } from './typed-view-transition';

/** A `startViewTransition` stub: runs the update, and settles when the test says. */
function stubStart() {
  let settle!: () => void;
  const finished = new Promise<void>((r) => { settle = r; });
  const start = vi.fn((arg: any) => {
    (typeof arg === 'function' ? arg : arg.update)();
    return { finished };
  });
  (document as any).startViewTransition = start;
  return { start, settle };
}

afterEach(() => {
  delete (document as any).startViewTransition;
  delete (window as any).ViewTransition;
  delete document.documentElement.dataset.vtType;
});

describe('typedViewTransitions', () => {
  it('is undefined without View Transition support', () => {
    expect(typedViewTransitions()).toBeUndefined();
  });

  it('passes an untyped transition straight through', () => {
    const { start } = stubStart();
    const update = vi.fn();
    typedViewTransitions()!(update);
    expect(start).toHaveBeenCalledWith(update);
    expect(update).toHaveBeenCalled();
  });

  it('declares the direction as a View Transition type where types are supported', () => {
    const { start } = stubStart();
    (window as any).ViewTransition = class { get types() { return new Set(); } };
    const update = vi.fn();
    typedViewTransitions()!(update, 'page-to-card');
    expect(start).toHaveBeenCalledWith({ update, types: ['page-to-card'] });
    expect(document.documentElement.dataset.vtType).toBeUndefined();
  });

  it('falls back to html[data-vt-type] for the length of the transition', async () => {
    const { start, settle } = stubStart();
    let during: string | undefined;
    typedViewTransitions()!(() => { during = document.documentElement.dataset.vtType; }, 'card-to-page');
    expect(typeof start.mock.calls[0][0]).toBe('function');
    expect(during).toBe('card-to-page');

    settle();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.documentElement.dataset.vtType).toBeUndefined();
  });
});
