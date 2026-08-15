// The ranking comparator — what "Most* Interesting" sorts by (issue #80,
// decided in #68).
//
// A chain, not a weighted score: every position is explainable by naming the
// first rung that separated the two cards, and no rung can be drowned out by
// another one's magnitude.
//
//   1. filter-match count, descending — with several values selected in one
//      dimension, a card matching more of them always comes first
//   2. priority                        (see priority.ts — it ACCUMULATES)
//   3. unseen before seen
//   4. `order`, only between two cards sharing a folder
//   5. that folder's declared `sort`   (see folder-sort.ts)
//   6. uid, so the result is deterministic
//
// Rungs 1 and 3 are runtime — filters change and seen-ness is per-visitor — so
// they arrive as accessors on the context rather than as card fields. Rungs 2,
// 4, 5 and 6 are decided at build and ride on CardMeta.
//
// Priority sits ABOVE seen deliberately: the other way round, an authored boost
// quietly stops mattering to exactly the returning visitors it was aimed at.
//
// `order` keeps its existing meaning — sequence WITHIN a folder (series
// position, collapse representative). It is not overloaded into a global
// priority: an arctic chapter's `order: 3` competing with about-me's boost
// would be a category error, which is why rung 4 only fires between two cards
// of the same folder.
//
// Pure: no DOM, no Astro, no dimension registry (countSelectedValueMatches in
// src/dimensions/apply.ts is what feeds rung 1).

import { compareSortValues, DEFAULT_FOLDER_SORT, type FolderSort } from './folder-sort.ts';
import { DEFAULT_PRIORITY } from './priority.ts';

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

/** The runtime half of the chain, injected so the comparator stays pure. */
export type RankingContext = {
  /** How many selected filter values this card matches (rung 1). */
  matchCount?: (card: RankableCard) => number;
  /** Whether the visitor has already read this card (rung 3). */
  isSeen?: (card: RankableCard) => boolean;
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
export function compareCards(a: RankableCard, b: RankableCard, ctx: RankingContext = {}): number {
  // 1. Filter-match count, descending.
  if (ctx.matchCount) {
    const diff = ctx.matchCount(b) - ctx.matchCount(a);
    if (diff !== 0) return diff;
  }

  // 2. Priority, descending — higher is more interesting.
  const priorityDiff = (b.priority ?? DEFAULT_PRIORITY) - (a.priority ?? DEFAULT_PRIORITY);
  if (priorityDiff !== 0) return priorityDiff;

  // 3. Unseen before seen.
  if (ctx.isSeen) {
    const seenDiff = Number(ctx.isSeen(a)) - Number(ctx.isSeen(b));
    if (seenDiff !== 0) return seenDiff;
  }

  const sameFolder = folderOf(a.uid) === folderOf(b.uid);
  if (sameFolder) {
    // 4. `order`, ascending — but only within one folder, and only when both
    // cards declare it. One card of a pair having an `order` says nothing
    // about how it relates to a sibling that has none.
    if (a.order !== undefined && b.order !== undefined && a.order !== b.order) {
      return a.order - b.order;
    }

    // 5. The folder's declared sort. Both cards share the folder, so they
    // agree on the key and direction; an undeclared sort is the default.
    const sort = a.sort ?? b.sort ?? DEFAULT_FOLDER_SORT;
    const sortDiff = compareSortValues(a.sort?.value, b.sort?.value, sort.direction);
    if (sortDiff !== 0) return sortDiff;
  }

  // 6. uid.
  return a.uid.localeCompare(b.uid);
}

/** Ranks a card list. Does not mutate the input. */
export function rankCards<T extends RankableCard>(cards: readonly T[], ctx: RankingContext = {}): T[] {
  return [...cards].sort((a, b) => compareCards(a, b, ctx));
}
