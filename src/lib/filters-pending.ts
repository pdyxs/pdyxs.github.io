// The results-area loading guard, and the one decision about when a client-side
// lens transition needs it — issue #125, completing #119/#123.
//
// ── What the guard is ──
//
// `data-filters-pending` hides a browse lens's real results (`.fp-browse-list`,
// `.card-strip`, the count, the empty message) and shows the skeleton in their
// place, until the island has committed the order the *client* decides. The
// rules live in global.css; this module owns the attribute's name, its values,
// and who is allowed to be wearing it.
//
// ── Why a transition needs it at all ──
//
// `BrowseLensBrowser` re-sorts on hydration: rungs 1 and 3 of the ranking chain
// (filter-match count, unseen-before-seen) are only knowable in the browser, so
// the server renders rungs 2/4/5/6 and the client swaps in the real order. On a
// COLD load that swap is covered — Base.astro's pre-paint script sets this
// attribute on <html> before anything paints. A client-side transition
// (`replaceSlot`, `pushCard`) fetches the same server-rendered fragment and
// hydrates it IN VIEW, with nothing covering it: measured at ~400ms of churn
// ending in a 1877px collapse as cards of different heights change places.
//
// ── The guard has a HOST, not just a value ──
//
// A cold load can hide everything on the page, because there is only one lens
// on it. A transition cannot: the stack routinely holds a second browse lens
// behind the active one (push a `tag:` link from a lens and there are two), and
// a global flag would blank that one too and — worse — would be cleared by ITS
// island's effect the moment the shared filter store moved, revealing the
// incoming card mid-churn. So a transition flags the incoming `.stack-card`
// and nothing else.
//
// That is also why clearing walks UP from the island rather than naming
// <html>: `closest()` finds whichever host is covering *this* island — the
// card on a transition, <html> on a cold load — and finds nothing at all for an
// island in some other card, which is exactly the premature clear to avoid.
//
// ── Why the incoming fragment is held, rather than the swap deferred ──
//
// The other option the ticket offers is not committing the swap until the
// client order is final. It cannot work here: an `<astro-island>` hydrates on
// `connectedCallback`, so "hydrate it first" means inserting it in the document
// anyway; a hidden ancestor would break every measurement its effects take; and
// the ~400ms it takes would be 400ms in which a click on a lens chip does
// visibly nothing. Holding the incoming fragment behind the skeleton reuses the
// #119/#123 vocabulary exactly, and lands the results once, in their final
// order.

import { isRankingLens } from './browse-helpers.ts';
import { historyMode } from './history-lens.ts';

export const FILTERS_PENDING_ATTR = 'data-filters-pending';

/**
 * The attribute's value is WHICH trigger fired (issue #123), because the two
 * part company at the safety net and in the strip rules:
 *
 * - `filtered` — the URL/params carry filters, so the server-rendered set is
 *   the wrong *content*, not merely the wrong order.
 * - `''` — a re-rank only: correct content, stale order.
 * - `stalled` — the safety net gave up on a `filtered` guard. Never a starting
 *   value; see `stalledFiltersPending`.
 */
export type FiltersPendingValue = 'filtered' | '' | 'stalled';

/** Matches Base.astro's pre-paint net, deliberately: one number, one meaning. */
export const FILTERS_PENDING_STALL_MS = 3000;

/**
 * Does this lens's body decide a different ORDER (or a different set) in the
 * browser than the server rendered?
 *
 * Two do. A ranking lens runs the two runtime rungs of the comparator chain.
 * A history lens (Seen/Unseen) partitions the pool on localStorage, which the
 * server cannot know at all — Unseen prerenders the full pool and Seen
 * prerenders nothing, so both move once the island lands.
 *
 * A date-sorted strip (Newest/Oldest) does not: its hydration order is
 * identical to the server's, which is why an unfiltered transition into one
 * shows its run immediately and pays no skeleton.
 */
export function lensReRanksOnClient(config?: Record<string, unknown>): boolean {
  return isRankingLens(config) || historyMode(config) !== null;
}

export interface TransitionGuardInput {
  /**
   * The incoming location's lens config, or null when it is a card (or a lens
   * the registry doesn't know). A card fragment renders the same thing on both
   * sides of the wire and never needs holding.
   */
  lensConfig?: Record<string, unknown> | null;
  /** Is the incoming location a lens at all? */
  isLens: boolean;
  /** Does the incoming location carry any `filter`/`filter.*` param? */
  hasFilterParams: boolean;
  /** Has this visitor read anything? (Rung 3 is inert without a history.) */
  hasReadHistory: boolean;
}

/**
 * The guard value a client-side transition into this location needs, or `null`
 * for "nothing to hide — land it immediately".
 *
 * The same two triggers as the pre-paint script, decided from what the stack
 * actually knows rather than from the pathname:
 *
 * - filters carried → `filtered`. The fragment is fetched by *uid*
 *   (`/fragment/lens/interesting`), so the server always renders it unfiltered
 *   — exactly the #119 case, arriving by a different road.
 * - otherwise a re-ranking lens for a returning visitor → `''`.
 *
 * A first-time visitor's re-rank is a no-op, so they pay nothing; and an
 * unfiltered date strip is excluded by `lensReRanksOnClient`, so it pays
 * nothing either.
 */
export function filtersPendingForTransition(input: TransitionGuardInput): FiltersPendingValue | null {
  if (!input.isLens) return null;
  if (input.hasFilterParams) return 'filtered';
  if (input.hasReadHistory && lensReRanksOnClient(input.lensConfig ?? undefined)) return '';
  return null;
}

/** Does a param key narrow a lens? The same test the pre-paint script makes. */
export function isFilterParamKey(key: string): boolean {
  return key === 'filter' || key.startsWith('filter.');
}

export function hasFilterParamKey(keys: Iterable<string>): boolean {
  for (const key of keys) if (isFilterParamKey(key)) return true;
  return false;
}

/**
 * What the guard becomes when the safety net fires, given its current value.
 *
 * `null` means "take it off". The asymmetry is #119's ruling: a filtered guard
 * must NOT reveal, because the prerendered set is the wrong answer to the
 * question the visitor asked, so it re-flags `stalled` and the skeleton swaps
 * its note for an explanation. A re-rank-only guard reveals — correct content
 * in a stale order beats holding correct content back forever.
 */
export function stalledFiltersPending(current: string | null): FiltersPendingValue | null {
  if (current === null) return null;
  return current === '' ? null : 'stalled';
}

// ── Thin appliers ──────────────────────────────────────────────────
// Two DOM pokes, kept here beside the decision they apply because both ends of
// the guard (CardStack sets it, three lens bodies clear it) would otherwise
// each spell the attribute name out for themselves.

/**
 * Flag one host — a `.stack-card` for a transition — and arm the same safety
 * net the pre-paint script arms, so an island that never lands cannot hold the
 * results back forever.
 */
export function applyFiltersPending(host: Element, value: FiltersPendingValue): void {
  host.setAttribute(FILTERS_PENDING_ATTR, value);
  setTimeout(() => {
    if (!host.isConnected) return;
    const next = stalledFiltersPending(host.getAttribute(FILTERS_PENDING_ATTR));
    if (next === null) host.removeAttribute(FILTERS_PENDING_ATTR);
    else host.setAttribute(FILTERS_PENDING_ATTR, next);
  }, FILTERS_PENDING_STALL_MS);
}

/**
 * Clear whichever host is covering `node` — the card on a transition, <html>
 * on a cold load, nothing at all for an island in another card. Called by the
 * lens bodies once their committed DOM reflects the client's own order.
 */
export function clearFiltersPending(node: Element | null | undefined): void {
  node?.closest(`[${FILTERS_PENDING_ATTR}]`)?.removeAttribute(FILTERS_PENDING_ATTR);
}
