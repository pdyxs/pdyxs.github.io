import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createCardPoolLoader,
  isSharedCardPoolAsset,
  failureReason,
  CardPoolError,
  POOL_TIMEOUT_MS,
  CARD_POOL_URL,
  CARD_POOL_PROMISE_KEY,
} from './card-pool.client';

/** The six keys, minimally shaped. */
function fakeAsset(marker = 'a') {
  return {
    cards: [{ uid: marker }],
    tagDisplay: { 'what:games': { name: 'Games' } },
    hierarchies: { what: [] },
    groupOrder: { what: ['Series'] },
    cardBackedValues: ['what:games'],
    seriesMembers: {},
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('isSharedCardPoolAsset', () => {
  it('accepts the six-key asset', () => {
    expect(isSharedCardPoolAsset(fakeAsset())).toBe(true);
  });

  it('rejects anything that merely parsed', () => {
    // The case this exists for: a host serving an HTML error page, or any
    // response that survives JSON.parse without being the pool. An island
    // handed `{}` renders an empty site with no error anywhere.
    for (const value of [null, undefined, 0, 'cards', [], {}]) {
      expect(isSharedCardPoolAsset(value)).toBe(false);
    }
  });

  it('rejects an asset missing any one key', () => {
    for (const key of ['cards', 'tagDisplay', 'hierarchies', 'groupOrder', 'cardBackedValues', 'seriesMembers']) {
      const partial: Record<string, unknown> = fakeAsset();
      delete partial[key];
      expect(isSharedCardPoolAsset(partial), key).toBe(false);
    }
  });

  it('rejects an array where an object is required, and vice versa', () => {
    expect(isSharedCardPoolAsset({ ...fakeAsset(), tagDisplay: [] })).toBe(false);
    expect(isSharedCardPoolAsset({ ...fakeAsset(), cards: {} })).toBe(false);
    expect(isSharedCardPoolAsset({ ...fakeAsset(), cardBackedValues: {} })).toBe(false);
  });
});

describe('failureReason', () => {
  it('keeps a CardPoolError\'s own reason', () => {
    expect(failureReason(new CardPoolError('timeout'))).toBe('timeout');
    expect(failureReason(new CardPoolError('malformed'))).toBe('malformed');
    expect(failureReason(new CardPoolError('network'))).toBe('network');
  });

  it('calls everything else a network failure', () => {
    // A blocked or offline fetch throws TypeError; an HTML error page reaches
    // JSON.parse and throws SyntaxError. Neither is distinguishable to a
    // visitor from "it didn't load".
    expect(failureReason(new TypeError('Failed to fetch'))).toBe('network');
    expect(failureReason(new SyntaxError('Unexpected token <'))).toBe('network');
    expect(failureReason('nope')).toBe('network');
  });
});

describe('createCardPoolLoader — single flight', () => {
  it('fetches once for concurrent callers and hands them the same promise', async () => {
    const fetchPool = vi.fn().mockResolvedValue(fakeAsset());
    const load = createCardPoolLoader({ fetchPool });

    const a = load();
    const b = load();
    expect(a).toBe(b);
    expect(await a).toBe(await b);
    expect(fetchPool).toHaveBeenCalledTimes(1);
  });

  it('never re-fetches after a success', async () => {
    const fetchPool = vi.fn().mockResolvedValue(fakeAsset());
    const load = createCardPoolLoader({ fetchPool });

    await load();
    await load();
    await load();
    expect(fetchPool).toHaveBeenCalledTimes(1);
  });

  it('adopts the pre-hydration promise instead of fetching', async () => {
    const fetchPool = vi.fn().mockResolvedValue(fakeAsset('fetched'));
    const load = createCardPoolLoader({
      fetchPool,
      preloaded: () => Promise.resolve(fakeAsset('preloaded')),
    });

    expect((await load()).cards).toEqual([{ uid: 'preloaded' }]);
    // The doubled-request failure `<link rel=preload>` was rejected for.
    expect(fetchPool).not.toHaveBeenCalled();
  });

  it('falls back to its own fetch when the document started none', async () => {
    const fetchPool = vi.fn().mockResolvedValue(fakeAsset('fetched'));
    const load = createCardPoolLoader({ fetchPool, preloaded: () => undefined });

    expect((await load()).cards).toEqual([{ uid: 'fetched' }]);
    expect(fetchPool).toHaveBeenCalledTimes(1);
  });

  it('reads the pre-hydration promise lazily, not at construction', async () => {
    // The module is evaluated when its importing chunk is, which in an
    // injected fragment can be before the host's script has run.
    let preloaded: unknown;
    const load = createCardPoolLoader({
      preloaded: () => preloaded,
      fetchPool: () => Promise.reject(new Error('should not fetch')),
    });
    preloaded = Promise.resolve(fakeAsset('late'));

    expect((await load()).cards).toEqual([{ uid: 'late' }]);
  });
});

describe('createCardPoolLoader — failure', () => {
  it('rejects with a malformed CardPoolError when the body is not a pool', async () => {
    const load = createCardPoolLoader({ fetchPool: async () => ({ nope: true }) });
    await expect(load()).rejects.toMatchObject({
      name: 'CardPoolError',
      reason: 'malformed',
    });
  });

  it('propagates a rejected pre-hydration promise', async () => {
    const load = createCardPoolLoader({
      preloaded: () => Promise.reject(new TypeError('Failed to fetch')),
      fetchPool: async () => fakeAsset(),
    });
    await expect(load()).rejects.toThrow('Failed to fetch');
  });

  it('drops a failure so a retry re-attempts', async () => {
    // This is what makes the spec's retry control work: a memoised rejection
    // would hand every retry the same old error.
    const fetchPool = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(fakeAsset('second'));
    const load = createCardPoolLoader({ fetchPool });

    await expect(load()).rejects.toThrow('Failed to fetch');
    expect((await load()).cards).toEqual([{ uid: 'second' }]);
    expect(fetchPool).toHaveBeenCalledTimes(2);
  });

  it('stops consulting a FAILED pre-hydration promise, so a retry can succeed', async () => {
    // `window.__cardsPool` is settled for the life of the document, so a failed
    // one hands back the same rejection every time it is read. Without dropping
    // it, the retry control could never succeed however healthy the network got
    // — measured in a browser with /cards.json aborted (#150).
    const preloaded = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    const fetchPool = vi.fn(async () => fakeAsset('second'));
    const load = createCardPoolLoader({ preloaded, fetchPool });

    await expect(load()).rejects.toThrow('Failed to fetch');
    expect(fetchPool).not.toHaveBeenCalled();

    expect((await load()).cards).toEqual([{ uid: 'second' }]);
    expect(fetchPool).toHaveBeenCalledTimes(1);
  });

  it('shares one in-flight failure between concurrent callers', async () => {
    const fetchPool = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const load = createCardPoolLoader({ fetchPool });

    const [a, b] = [load(), load()];
    await expect(a).rejects.toThrow();
    await expect(b).rejects.toThrow();
    expect(fetchPool).toHaveBeenCalledTimes(1);
  });
});

describe('createCardPoolLoader — timeout', () => {
  it('rejects with a timeout reason once timeoutMs elapses', async () => {
    vi.useFakeTimers();
    const load = createCardPoolLoader({
      fetchPool: () => new Promise(() => {}),
      timeoutMs: 1000,
    });

    const pending = load();
    const assertion = expect(pending).rejects.toMatchObject({ reason: 'timeout' });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('does not time out a load that resolves first', async () => {
    vi.useFakeTimers();
    const load = createCardPoolLoader({
      fetchPool: async () => fakeAsset(),
      timeoutMs: 1000,
    });

    const asset = await load();
    expect(asset.cards).toEqual([{ uid: 'a' }]);
    // The timer is cleared on settle, so nothing is left pending to fire.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('drops a timeout so a retry re-attempts', async () => {
    vi.useFakeTimers();
    const fetchPool = vi
      .fn()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce(fakeAsset('second'));
    const load = createCardPoolLoader({ fetchPool, timeoutMs: 1000 });

    const first = load();
    const assertion = expect(first).rejects.toMatchObject({ reason: 'timeout' });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;

    expect((await load()).cards).toEqual([{ uid: 'second' }]);
  });
});

describe('the contract the inline script shares', () => {
  it('names the same URL and global Base.astro hardcodes', () => {
    // Both are literals on both sides — #138 fixed the filename so no
    // define:vars is needed. If either constant is renamed, the inline script
    // in Base.astro must change with it.
    expect(CARD_POOL_URL).toBe('/cards.json');
    expect(CARD_POOL_PROMISE_KEY).toBe('__cardsPool');
  });

  it('sets one timeout, longer than the onMount-sized stall it replaces', () => {
    expect(POOL_TIMEOUT_MS).toBeGreaterThan(3000);
  });
});
