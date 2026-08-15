// Pure decisions for the two visitor-history lenses — Seen and Unseen
// (issue #84, decided in #68).
//
// Both browse the same pool every other lens does; what makes them lenses
// rather than filters is that Seen carries a sort order nothing else has (the
// visitor's own reading order) and Unseen is its exact complement. Neither
// reads localStorage here: the two readers arrive as a `ReadHistory` so the
// whole decision stays testable without a DOM. The applier is
// HistoryLensBrowser.svelte, which builds one from card-view-state.ts.
//
// **The ruling on a card you read that has since been edited.** View state is
// keyed two ways (see card-view-state.ts): unseen-ness on (uid, contentHash),
// history on uid alone. So an edited card is simultaneously "read" (it is in
// your history) and "unseen" (its content changed). Both lenses here key on
// **uid alone**, which puts that card in Seen and keeps it out of Unseen:
//
//   - Seen is a record of what you did, and no later edit can undo it.
//   - Unseen is a to-read list. A card you read and the author then fixed a
//     typo in is not something you have yet to get to, and if edits pushed
//     cards back into it the list could never empty — which would cost the
//     lens its whole point (and its "you have read everything" ending).
//   - The two lenses are presented as complements, so a card appearing in both
//     at once reads as a bug however it is justified. Keying both the same way
//     makes them partition the pool exactly.
//
// "This changed, look again" is not given up — it already has a home in the
// ranking chain's rung 3, which reads the hash-SENSITIVE getViewState, so an
// edited card floats back up the ranked lenses and the front page. Freshness
// is a ranking signal; membership here is a fact about the visitor.

import { compareReadAt } from './card-view-state.ts';
import { rankCards, type RankableCard, type RankingContext } from './ranking.ts';

/** Which of the two history lenses a `config` asks for, if either. */
export type HistoryMode = 'seen' | 'unseen';

/**
 * The visitor's reading history, injected rather than read.
 *
 * Both members key on uid alone — see the ruling above. `readAt` is null for a
 * card read before #83 shipped the timestamp, which is a *read* card with an
 * unknown time, never an unread one; compareReadAt sorts those last.
 */
export type ReadHistory = {
  hasRead: (uid: string) => boolean;
  readAt: (uid: string) => string | null;
};

/**
 * Reads the history mode out of a lens's registry `config` (`readState: seen`),
 * or null for every other lens.
 *
 * A config key rather than a component key: both lenses share one body, and
 * which of the two it is drives the sort, the narrowing and the empty state
 * together — one decision, made once, from the lens declaration.
 */
export function historyMode(config?: Record<string, unknown>): HistoryMode | null {
  const value = config?.readState;
  return value === 'seen' || value === 'unseen' ? value : null;
}

/**
 * The cards the visitor has opened, most recently read first.
 *
 * This is the sort that justifies a lens: no build-time ordering can express
 * it, because it is per-visitor and lives only in their browser. A card read
 * before the timestamp existed sorts to the end rather than to the epoch,
 * where it would claim to be the oldest thing they ever read.
 */
export function seenCards<T extends { uid: string }>(cards: readonly T[], history: ReadHistory): T[] {
  return cards
    .filter(card => history.hasRead(card.uid))
    .sort((a, b) => compareReadAt(history.readAt(a.uid), history.readAt(b.uid)));
}

/**
 * The cards the visitor has never opened, in the site's ordinary ranking order
 * (ranking.ts) — the same chain Most* Interesting sorts by.
 *
 * `ctx.isSeen` is deliberately not passed on by callers: every card here is
 * unseen by construction, so rung 3 can only ever tie. Rung 1 (filter-match
 * count) is the one that still does work.
 */
export function unseenCards<T extends RankableCard>(
  cards: readonly T[],
  history: ReadHistory,
  ctx: RankingContext<T> = {},
): T[] {
  return rankCards(cards.filter(card => !history.hasRead(card.uid)), ctx);
}

/** Dispatches to seenCards/unseenCards. */
export function selectHistoryCards<T extends RankableCard>(
  cards: readonly T[],
  mode: HistoryMode,
  history: ReadHistory,
  ctx: RankingContext<T> = {},
): T[] {
  return mode === 'seen' ? seenCards(cards, history) : unseenCards(cards, history, ctx);
}

/**
 * What an empty result should say, given WHY it is empty.
 *
 * Both lenses are empty in the common case at launch — Seen for every
 * first-time visitor, and Unseen for anyone who finishes the site — so the
 * empty state is the main state, not a failure mode. But "you haven't opened
 * anything yet" is a lie the moment the visitor HAS history and a filter is
 * what excluded it, so the reason has to come in:
 *
 * @param anyHistory - does the visitor have ANY read card in the whole pool
 *   (before filters)?
 * @param anyUnread - is ANY card in the whole pool unread (before filters)?
 */
export function historyEmptyMessage(
  mode: HistoryMode,
  { anyHistory, anyUnread }: { anyHistory: boolean; anyUnread: boolean },
): string {
  if (mode === 'seen') {
    return anyHistory
      ? 'None of the cards you have opened match the current filters.'
      : 'Nothing here yet. Cards collect here as you open them, most recently read first — and only in this browser, since none of it leaves your machine.';
  }
  return anyUnread
    ? 'You have opened everything the current filters leave. Clear a filter to find more.'
    : 'You have opened every card on the site. Nothing left to find — Seen will show you the way back.';
}
