// Client-side read-aware expansion of a collapsed series
// (docs/agents/lenses-and-browse.md: "A collapsed series can show two entries";
// the build-time half is `collapsedSeriesMembers` in collapse.ts).
//
// `collapseCollections` runs once, at build time, on the server — it has no
// notion of any particular visitor, so it can only ever emit ONE entry per
// collapsed folder. Whether that folder should show as one entry or two is a
// question about THIS visitor's read history, which exists only in their
// browser. So the expansion is a second, client-side pass over the already-
// collapsed pool, using the `seriesMembers` lookup the pool ships alongside
// it (see card-pool.ts / card-pool.client.ts).
//
// The rule, in full:
//
//   1. The representative entry is unconditionally kept. Its own read state
//      (as far as the rest of the site's ranking/history logic is concerned)
//      is "has ANY member of the series been read" — not just whether the
//      representative's own uid was opened directly. Reading chapter 3 of a
//      6-chapter series makes the whole series count as read, even though the
//      representative still points at chapter 1.
//   2. A SECOND entry is added only when (1) is true AND at least one member
//      remains unread: the first such member, in series order. It is the
//      real, un-collapsed member card — own title, own tags, own thumbnail —
//      not a synthetic node, so it behaves exactly like any other card
//      wherever it lands (filtering, ranking, the browse grid).
//
// Pure and framework-agnostic, like every other decision in this codebase:
// `isRead` is injected so the same function serves both read concepts the
// site already has (see card-view-state.ts's "One seen concept, keyed two
// ways") without hardcoding either:
//   - hash-aware `getViewState` for the ranking chain (rungs 2 and 4), used by
//     BrowseLensBrowser.svelte and HomeLensSlots.svelte,
//   - uid-only `hasBeenRead` for the Seen/Unseen lenses (history-lens.ts),
//     used by HistoryLensBrowser.svelte.
//
// Deliberately NOT wired into EditorialLensBrowser.svelte: that lens groups by
// publish status, not read state, and has no isSeen concept to begin with.

/** Any member's read state can be decided from at least its own uid. */
type SeriesMember = { uid: string };

/** Every collapsed folder's ordered membership, keyed by the representative's uid. */
export type SeriesMembersLookup<T extends SeriesMember> = Record<string, T[]>;

/**
 * Whether `card`'s series counts as read: true if ANY of its members does
 * (via `isRead`). A card that isn't a collapsed representative (no entry in
 * `seriesMembers`) falls back to its own read state, so this is a safe
 * drop-in replacement for a plain `isRead(card)` check everywhere.
 */
export function isSeriesRead<T extends SeriesMember>(
  card: T,
  seriesMembers: SeriesMembersLookup<T>,
  isRead: (member: T) => boolean,
): boolean {
  const members = seriesMembers[card.uid];
  return members && members.length > 0 ? members.some(isRead) : isRead(card);
}

/**
 * The first not-yet-read member of `card`'s series, in series order — or
 * undefined when `card` isn't a collapsed representative, or every member has
 * been read.
 */
function firstUnreadMember<T extends SeriesMember>(
  card: T,
  seriesMembers: SeriesMembersLookup<T>,
  isRead: (member: T) => boolean,
): T | undefined {
  return seriesMembers[card.uid]?.find(member => !isRead(member));
}

/** What `expandCollapsedSeries` returns: the (possibly longer) card list, and
 * which of its uids count as read — the same fact the caller would otherwise
 * have to recompute in a second pass over the result to build a seen/read
 * snapshot. */
export type ExpandedSeries<T extends SeriesMember> = {
  cards: T[];
  readUids: Set<string>;
};

/**
 * Expands every collapsed-series representative in `cards` per the rule
 * above. Cards with no entry in `seriesMembers` pass through unchanged, their
 * own read state decided by `isRead` alone.
 *
 * One pass, one decision: `readUids` is derived from exactly the same
 * `isSeriesRead`/`firstUnreadMember` calls used to decide expansion, so the
 * returned read set can never disagree with the entries that were actually
 * emitted.
 */
export function expandCollapsedSeries<T extends SeriesMember>(
  cards: readonly T[],
  seriesMembers: SeriesMembersLookup<T>,
  isRead: (member: T) => boolean,
): ExpandedSeries<T> {
  const out: T[] = [];
  const readUids = new Set<string>();

  for (const card of cards) {
    out.push(card);
    const members = seriesMembers[card.uid];
    if (members && members.length > 0) {
      if (members.some(isRead)) {
        readUids.add(card.uid);
        const next = firstUnreadMember(card, seriesMembers, isRead);
        if (next) out.push(next);
      }
    } else if (isRead(card)) {
      readUids.add(card.uid);
    }
  }

  return { cards: out, readUids };
}
