// Shared, dependency-light helpers for reasoning about a card's own identity
// as a dimension-rooted filter value — used by both tag-registry.ts (display
// resolution) and filters.ts / browse-helpers.ts (match/count logic). Kept
// separate from tag-registry.ts to avoid a circular import (tag-registry.ts
// imports from filters.ts).

import type { CardMeta } from './cards';

/**
 * Returns the full-path filter value a card's own folder represents (distinct
 * from its inherited path tag, which is its *parent* folder's value). E.g.
 * uid "what/projects/games/foo" -> "what:projects/games/foo".
 */
export function ownValueForCard(uid: string): string | undefined {
  const slashIdx = uid.indexOf('/');
  if (slashIdx === -1) return undefined;
  const dimension = uid.slice(0, slashIdx);
  const rest = uid.slice(slashIdx + 1);
  return rest ? `${dimension}:${rest}` : undefined;
}

/**
 * Returns the set of every value that is some card's own path.
 *
 * When such a value shows up as a *tag* on a different card, it's a direct
 * link to that card (a "card-backed tag") — not a claim that the tagging
 * card belongs in that value's category. Match/count logic must not let a
 * card-backed tag prefix-match into an ancestor filter (e.g. a blog post
 * tagged with a project card must not show up when browsing that project's
 * parent "what:projects" category).
 */
export function cardOwnValues(cards: CardMeta[]): Set<string> {
  const values = new Set<string>();
  for (const card of cards) {
    const value = ownValueForCard(card.uid);
    if (value) values.add(value);
  }
  return values;
}

/**
 * Reverse index of card-backed tags: for every card, the other cards that
 * link to it by tagging its own value (see `ownValueForCard`). Used to show
 * a "what links here" section on a card — e.g. a project card surfaces every
 * blog post tagged with that project's own path.
 */
export function computeRelatedCardsIndex(cards: CardMeta[]): Map<string, CardMeta[]> {
  const uidByOwnValue = new Map<string, string>();
  for (const card of cards) {
    const value = ownValueForCard(card.uid);
    if (value && !uidByOwnValue.has(value)) uidByOwnValue.set(value, card.uid);
  }

  const index = new Map<string, CardMeta[]>();
  for (const card of cards) {
    for (const tag of card.tags) {
      const targetUid = uidByOwnValue.get(tag);
      if (!targetUid || targetUid === card.uid) continue;
      const related = index.get(targetUid);
      if (related) {
        related.push(card);
      } else {
        index.set(targetUid, [card]);
      }
    }
  }
  return index;
}
