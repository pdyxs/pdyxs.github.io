// The client half of the shared card pool: one fetch of `/cards.json` per
// visitor per document, shared by every island that needs it.
//
// The server half is `card-pool.ts`, which is SERVER-ONLY (it reaches
// `browse-card.ts` and therefore `astro:assets`). Nothing but the *type*
// crosses from there to here, and it crosses as `import type` so the import is
// erased — a value import would drag `getImage()` into an island bundle, where
// Astro 6 throws.
//
// **The fetch does not start here.** `Base.astro` sets `window.__cardsPool` from
// an `is:inline` script in `<head>`, so the request is in flight before any
// island hydrates; this module *adopts* that promise and only falls back to its
// own `fetch` when there isn't one (a fragment injected into a host document
// that predates this script, a test, an island rendered outside a page).
// `<link rel="preload" as="fetch">` was rejected for that job in #140: its
// cache-match rules (`as` and `crossorigin` must agree exactly with the later
// fetch) fail *silently*, and the symptom is a doubled 48 KB request nobody
// notices.
//
// **#102's SSR-isolation hazard does not apply**, and that is worth stating
// rather than assuming, because this module holds module-level state and #102
// is exactly about module-level state in a one-process prerender. The state
// here is written only by `load()`, which is only ever called from an island's
// `onMount` — client-only by construction. Module *evaluation* writes nothing:
// `createCardPoolLoader()` builds a closure whose `inflight` starts null. A
// server render therefore cannot put a value in it, so there is nothing for the
// next page in the prerenderer to inherit.

import type { SharedCardPoolAsset } from '@browse/results/card-pool';

/**
 * The one timeout, shared between home's stall and the browse family's failure
 * state — `FILTERS_PENDING_STALL_MS`' precedent of one number with one meaning
 * (#140).
 *
 * Bigger than the 3000ms it replaces (`HomeLensSlots`' `STALL_MS`) because that
 * number was sized against `onMount` work, not a network round trip: the asset
 * is ~48 KB gzipped, which is ~2s on a throttled connection before the browser
 * has even begun parsing. A timeout tuned for the wrong order of magnitude
 * gives up while the fetch is still in flight, and what the visitor gets for it
 * is a "couldn't load" message over a request that then succeeds.
 */
export const POOL_TIMEOUT_MS = 8000;

/** Fixed, unhashed, hardcoded — #138. See `src/pages/cards.json.ts`. */
export const CARD_POOL_URL = '/cards.json';

/** The global `Base.astro`'s inline script writes the in-flight promise to. */
export const CARD_POOL_PROMISE_KEY = '__cardsPool';

/** Why a pool load failed. Islands render one honest message per reason. */
export type CardPoolFailureReason = 'timeout' | 'network' | 'malformed';

export class CardPoolError extends Error {
  readonly reason: CardPoolFailureReason;

  constructor(reason: CardPoolFailureReason, message?: string) {
    super(message ?? reason);
    this.name = 'CardPoolError';
    this.reason = reason;
  }
}

/**
 * The six keys, checked as a shape rather than trusted.
 *
 * A pure decision, and not a pedantic one: GitHub Pages serves a 404 as an HTML
 * document, and a misconfigured host can serve `index.html` for anything. Most
 * of those die in `JSON.parse`, but "parsed to *something*" is not "is the
 * pool", and an island handed `{}` renders an empty site with no error
 * anywhere — the failure this guard converts into a visible one.
 */
export function isSharedCardPoolAsset(value: unknown): value is SharedCardPoolAsset {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.cards) &&
    Array.isArray(v.cardBackedValues) &&
    isPlainObject(v.tagDisplay) &&
    isPlainObject(v.hierarchies) &&
    isPlainObject(v.groupOrder) &&
    isPlainObject(v.seriesMembers)
  );
}

function isPlainObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Anything thrown on the way to a pool, classified. Pure, so the mapping is
 * testable without a network: a `CardPoolError` keeps whatever reason it was
 * raised with, and everything else — a `TypeError` from a blocked or offline
 * `fetch`, a `SyntaxError` from `JSON.parse` on an HTML error page — is a
 * network failure as far as a visitor is concerned.
 */
export function failureReason(error: unknown): CardPoolFailureReason {
  return error instanceof CardPoolError ? error.reason : 'network';
}

/** The injected network seam. Returns the parsed body, whatever it turns out to be. */
export type PoolFetcher = () => Promise<unknown>;

export interface CardPoolLoaderOptions {
  /**
   * The pre-hydration promise, read lazily. Read at *load* time rather than at
   * construction because this module is evaluated when its importing chunk is,
   * which may be before the script that sets it has run in an injected fragment.
   */
  preloaded?: () => unknown;
  /** Defaults to `fetch(CARD_POOL_URL)`. Tests pass a fake source. */
  fetchPool?: PoolFetcher;
  timeoutMs?: number;
}

async function defaultFetchPool(): Promise<unknown> {
  const response = await fetch(CARD_POOL_URL);
  if (!response.ok) {
    throw new CardPoolError('network', `${CARD_POOL_URL} responded ${response.status}`);
  }
  return response.json();
}

function defaultPreloaded(): unknown {
  return (globalThis as Record<string, unknown>)[CARD_POOL_PROMISE_KEY];
}

/**
 * A loader over an injected seam, exactly as `createCardFragments({ load })` is
 * for the stack — the module boundary is where a test supplies a fake pool
 * source, so nothing here needs a network or a DOM.
 *
 * Single-flight: every caller gets the same promise. A *success* is kept for
 * the life of the document (the asset is immutable within a page load, and a
 * second fetch would buy nothing); a *failure* is dropped, which is what makes
 * the retry control the spec asks for work — calling `load()` again after a
 * rejection starts a fresh attempt rather than handing back the old error.
 */
export function createCardPoolLoader(
  options: CardPoolLoaderOptions = {},
): () => Promise<SharedCardPoolAsset> {
  const {
    preloaded = defaultPreloaded,
    fetchPool = defaultFetchPool,
    timeoutMs = POOL_TIMEOUT_MS,
  } = options;

  let inflight: Promise<SharedCardPoolAsset> | null = null;
  // The pre-hydration promise is a ONE-SHOT, and this is what makes the retry
  // control real (#150). `window.__cardsPool` is a settled promise for the life
  // of the document, so a failed one keeps handing back the SAME rejection —
  // every retry would re-read the original failure and no request would ever be
  // made. Once an attempt has failed, this loader stops consulting it and
  // fetches for itself. Measured in a browser with /cards.json aborted: without
  // this, "Try again" could not succeed even after the network came back.
  let preloadUsable = true;

  async function attempt(): Promise<SharedCardPoolAsset> {
    // The pre-hydration promise if the document started one and it hasn't
    // already failed, our own fetch otherwise. `??` rather than `||`: a
    // falsy-but-present value is still a document that already tried, and
    // re-fetching over the top of it is the doubled request this whole
    // arrangement exists to avoid.
    const source = (preloadUsable ? preloaded() : undefined) ?? (await fetchPool());
    const parsed = await source;
    if (!isSharedCardPoolAsset(parsed)) {
      throw new CardPoolError('malformed', `${CARD_POOL_URL} is not a card pool`);
    }
    return parsed;
  }

  async function withTimeout(body: Promise<SharedCardPoolAsset>): Promise<SharedCardPoolAsset> {
    let timer: ReturnType<typeof setTimeout>;
    const expiry = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new CardPoolError('timeout', `${CARD_POOL_URL} timed out`)),
        timeoutMs,
      );
    });
    // The timer is cleared either way, so a resolved load leaves nothing
    // pending — an un-cleared 8s timer holds a test's fake clock (and node's
    // event loop) open long after the thing it was guarding finished.
    return Promise.race([body, expiry]).finally(() => clearTimeout(timer));
  }

  return function load(): Promise<SharedCardPoolAsset> {
    inflight ??= withTimeout(attempt()).catch(error => {
      inflight = null;
      // Whatever failed, the document's own promise cannot be retried, so the
      // next attempt starts from a fresh fetch.
      preloadUsable = false;
      throw error;
    });
    return inflight;
  };
}

/**
 * The site's one pool load. Rejects with a `CardPoolError` on failure; call it
 * again to retry.
 */
export const loadCardPool = createCardPoolLoader();
