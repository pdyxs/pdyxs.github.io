// The ranking comparator — what "Most* Interesting" sorts by (issue #80,
// decided in #68).
//
// A chain, not a weighted score: every position is explainable by naming the
// first rung that separated the two cards, and no rung can be drowned out by
// another one's magnitude.
//
//   1. filter-match count, descending — with several values selected in one
//      dimension, a card matching more of them always comes first
//   2. pinned unseen: within a matchCount tier, the highest-priority unseen
//      card(s) jump to the very front — see below
//   3. priority                        (see priority.ts — it ACCUMULATES)
//   4. unseen before seen
//   5. `order`, only between two cards sharing a folder
//   6. that folder's declared `sort`   (see folder-sort.ts)
//   7. uid, so the result is deterministic
//
// Rungs 1, 2 and 4 are runtime — filters change and seen-ness is per-visitor —
// so they arrive as accessors on the context rather than as card fields. Rungs
// 3, 5, 6 and 7 are decided at build and ride on CardMeta.
//
// Priority sits ABOVE seen deliberately: the other way round, an authored boost
// quietly stops mattering to exactly the returning visitors it was aimed at.
//
// Rung 2 exists so that isn't absolute: a returning visitor with nothing new at
// the top priority tier would otherwise see nothing but re-reads, however far
// they scroll. It borrows priority as its tie-break ONLY among unseen cards, so
// "which unseen card gets pinned" still reads as the same authored signal —
// but it does not compete with rung 3's own ordering of everything else, which
// is why a lower-priority unseen card can be pinned ahead of a higher-priority
// seen one. It is scoped to the current matchCount tier (rung 1) so a pin never
// promotes a worse filter match, and it is computed once per rankCards() call
// — a global fact about the list, not a pairwise one — rather than per pair.
//
// `order` keeps its existing meaning — sequence WITHIN a folder (series
// position, collapse representative). It is not overloaded into a global
// priority: an arctic chapter's `order: 3` competing with about-me's boost
// would be a category error, which is why rung 4 only fires between two cards
// of the same folder.
//
// Pure: no DOM, no Astro, no dimension registry (countSelectedValueMatches in
// src/dimensions/apply.ts is what feeds rung 1).

import { compareSortValues, DEFAULT_FOLDER_SORT, type FolderSort } from '../../content/folders/folder-sort.ts';
import { DEFAULT_PRIORITY } from '../../content/cards/priority.ts';

/** The card fields the chain reads. A structural subset of CardMeta. */
export type RankableCard = {
  uid: string;
  /** Summed build-time priority — see priority.ts. */
  priority?: number;
  /** Sequence within this card's own folder. */
  order?: number;
  /** The card's folder-declared sort, with this card's value for its key. */
  sort?: FolderSort & { value?: number | string };
};

/**
 * The runtime half of the chain, injected so the comparator stays pure.
 *
 * Generic over the caller's own card type so an accessor can read fields the
 * comparator itself never touches (a slot's isSeen needs `contentHash`) without
 * casting back from RankableCard at every call.
 */
export type RankingContext<T extends RankableCard = RankableCard> = {
  /** How many selected filter values this card matches (rung 1). */
  matchCount?: (card: T) => number;
  /** Whether the visitor has already read this card (rung 4). */
  isSeen?: (card: T) => boolean;
  /**
   * Precomputed by `rankCards` — true for a card that should be pinned ahead
   * of priority (rung 2). Not meant to be supplied by callers; `compareCards`
   * accepts it purely so the rung can be expressed as a pairwise read like
   * every other one.
   */
  isPinnedUnseen?: (card: T) => boolean;
};

/** A card's containing folder, or '' for a card sitting at the tree root. */
export function folderOf(uid: string): string {
  const idx = uid.lastIndexOf('/');
  return idx === -1 ? '' : uid.slice(0, idx);
}

/**
 * The comparator itself. Returns <0 when `a` ranks ahead of `b`.
 *
 * Every rung returns as soon as it separates the pair, so a lower rung is only
 * ever consulted on a genuine tie above it.
 */
export function compareCards<T extends RankableCard>(a: T, b: T, ctx: RankingContext<T> = {}): number {
  // 1. Filter-match count, descending.
  if (ctx.matchCount) {
    const diff = ctx.matchCount(b) - ctx.matchCount(a);
    if (diff !== 0) return diff;
  }

  // 2. Pinned unseen — jumps ahead of priority. See the module comment.
  if (ctx.isPinnedUnseen) {
    const pinnedDiff = Number(ctx.isPinnedUnseen(b)) - Number(ctx.isPinnedUnseen(a));
    if (pinnedDiff !== 0) return pinnedDiff;
  }

  // 3. Priority, descending — higher is more interesting.
  const priorityDiff = (b.priority ?? DEFAULT_PRIORITY) - (a.priority ?? DEFAULT_PRIORITY);
  if (priorityDiff !== 0) return priorityDiff;

  // 4. Unseen before seen.
  if (ctx.isSeen) {
    const seenDiff = Number(ctx.isSeen(a)) - Number(ctx.isSeen(b));
    if (seenDiff !== 0) return seenDiff;
  }

  const sameFolder = folderOf(a.uid) === folderOf(b.uid);
  if (sameFolder) {
    // 5. `order`, ascending — but only within one folder, and only when both
    // cards declare it. One card of a pair having an `order` says nothing
    // about how it relates to a sibling that has none.
    if (a.order !== undefined && b.order !== undefined && a.order !== b.order) {
      return a.order - b.order;
    }

    // 6. The folder's declared sort. Both cards share the folder, so they
    // agree on the key and direction; an undeclared sort is the default.
    const sort = a.sort ?? b.sort ?? DEFAULT_FOLDER_SORT;
    const sortDiff = compareSortValues(a.sort?.value, b.sort?.value, sort.direction);
    if (sortDiff !== 0) return sortDiff;
  }

  // 7. uid.
  return a.uid.localeCompare(b.uid);
}

/**
 * For each matchCount tier present in `cards`, the highest priority declared
 * by any unseen card in that tier. A tier with no unseen cards has no entry —
 * "pin nothing" rather than "pin everything", which a `-Infinity` sentinel
 * would get wrong.
 */
function topUnseenPriorityByTier<T extends RankableCard>(
  cards: readonly T[],
  ctx: RankingContext<T>,
): Map<number, number> {
  const tiers = new Map<number, number>();
  if (!ctx.isSeen) return tiers;
  for (const card of cards) {
    if (ctx.isSeen(card)) continue;
    const tier = ctx.matchCount ? ctx.matchCount(card) : 0;
    const priority = card.priority ?? DEFAULT_PRIORITY;
    const current = tiers.get(tier);
    if (current === undefined || priority > current) tiers.set(tier, priority);
  }
  return tiers;
}

/** Ranks a card list. Does not mutate the input. */
export function rankCards<T extends RankableCard>(cards: readonly T[], ctx: RankingContext<T> = {}): T[] {
  const topUnseenPriority = topUnseenPriorityByTier(cards, ctx);
  const isPinnedUnseen = (card: T): boolean => {
    if (!ctx.isSeen || ctx.isSeen(card)) return false;
    const tier = ctx.matchCount ? ctx.matchCount(card) : 0;
    return (card.priority ?? DEFAULT_PRIORITY) === topUnseenPriority.get(tier);
  };
  const fullCtx: RankingContext<T> = { ...ctx, isPinnedUnseen };
  return [...cards].sort((a, b) => compareCards(a, b, fullCtx));
}
