// The series run, as browse-card previews.
//
// Server-only (serialiseBrowseCards imports astro:assets), which is why the
// pure part — which chapters are in the run and in what order — stays in
// series.ts. This is the thin IO shell around it: resolve the siblings, look
// each one up in the card pool, serialise.
//
// Both consumers of a series need it: SeriesNavRenderer for the header's
// position indicator (pure, so it calls getSeriesSiblings directly) and
// CardStackCard, which hands the previews to the content renderer so the
// "In this series" strip sits with the other card strips rather than below
// them.

import { getAllCards } from './cards';
import { getSeriesSiblings } from './series';
import type { StoryEntry } from './series';
import { serialiseBrowseCards } from './browse-card';
import type { BrowseCardData } from './browse-helpers';

export type ResolveSeriesCardsOptions = {
  /** import.meta.env.DEV — threaded to getSeriesSiblings' visibility gate. */
  isDev: boolean;
  now: Date;
};

/**
 * The whole series a chapter belongs to, in order, as browse-card previews.
 *
 * getSeriesSiblings decides the run and its order (and drops chapters that
 * aren't reachable); this only turns those ids into previews. getAllCards() is
 * the same resolution every other consumer uses and is cached per build —
 * nothing is re-derived here.
 */
export async function resolveSeriesCards(
  entry: StoryEntry,
  allEntries: StoryEntry[],
  { isDev, now }: ResolveSeriesCardsOptions,
): Promise<BrowseCardData[]> {
  const { siblings } = getSeriesSiblings(entry, allEntries, { isDev, now });
  const allCards = await getAllCards();
  const byUid = new Map(allCards.map(card => [card.uid, card]));
  return serialiseBrowseCards(
    siblings.map(s => byUid.get(s.id)).filter(card => card !== undefined),
  );
}
