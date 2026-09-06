// A fake shared card pool, and a loader over it.
//
// The pool's client half takes an injected `fetchPool` (see
// card-pool.client.ts), which is the seam every browse-family island test
// drives its body through — the same shape `createCardFragments({ load })` is
// for the stack. Nothing here touches a network or a DOM.
//
// Kept in src/test/ rather than beside one component because all three
// browse-family bodies (#150, slice 5 of docs/plans/shared-card-pool.md) read
// the same six-key asset and must agree about what one looks like.
import { createCardPoolLoader, CardPoolError } from '../lib/card-pool.client';
import type { CardPoolFailureReason } from '../lib/card-pool.client';
import type { SharedCardPoolAsset } from '../lib/card-pool';
import type { SerialisedCardFull } from '../lib/frontpage';
import { DEFAULT_PRIORITY } from '../lib/priority';
import { DEFAULT_FOLDER_SORT } from '../lib/folder-sort';

export function fakeCard(
  uid: string,
  overrides: Partial<SerialisedCardFull> = {},
): SerialisedCardFull {
  return {
    uid,
    title: uid.split('/').pop() ?? uid,
    date: '2024-03-15T00:00:00.000Z',
    tags: ['what:puzzles'],
    renderer: 'card',
    contentHash: `hash-${uid}`,
    priority: DEFAULT_PRIORITY,
    sort: DEFAULT_FOLDER_SORT,
    ...overrides,
  };
}

export function fakePool(
  cards: SerialisedCardFull[],
  seriesMembers: Record<string, SerialisedCardFull[]> = {},
): SharedCardPoolAsset {
  return {
    cards,
    tagDisplay: { 'what:puzzles': { name: 'Puzzles', declared: true } },
    hierarchies: {},
    groupOrder: {},
    cardBackedValues: [],
    seriesMembers,
  };
}

/**
 * A loader over a source the test controls. `preloaded` is stubbed out
 * deliberately: the real default reads `globalThis.__cardsPool`, which happy-dom
 * shares between test files.
 */
export function loaderOver(fetchPool: () => Promise<unknown>): () => Promise<SharedCardPoolAsset> {
  return createCardPoolLoader({ preloaded: () => undefined, fetchPool });
}

/** A loader that never settles — the pending state. */
export function pendingLoader(): () => Promise<SharedCardPoolAsset> {
  return loaderOver(() => new Promise<unknown>(() => {}));
}

/** A loader that resolves to `asset`. */
export function readyLoader(asset: SharedCardPoolAsset): () => Promise<SharedCardPoolAsset> {
  return loaderOver(() => Promise.resolve(asset));
}

/**
 * A loader that fails `times` times and then resolves — which is what makes the
 * retry control testable: the real loader drops a failed attempt, so calling it
 * again starts a fresh one.
 */
export function flakyLoader(
  asset: SharedCardPoolAsset,
  times = 1,
  reason: CardPoolFailureReason = 'network',
): { load: () => Promise<SharedCardPoolAsset>; attempts: () => number } {
  let attempts = 0;
  const load = loaderOver(() => {
    attempts += 1;
    return attempts <= times
      ? Promise.reject(new CardPoolError(reason))
      : Promise.resolve(asset);
  });
  return { load, attempts: () => attempts };
}
