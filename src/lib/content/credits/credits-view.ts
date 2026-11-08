/**
 * The one composition both card routes call in `getStaticPaths`, computed once
 * (like `computeRelatedCardsIndex`): per card, the plain data the credits
 * island renders. Layout runs here, at build time; the browser does none.
 */
import { creditsView as listingView, type Credit, type MadeByLine, type CreditListingSection } from './credits';
import { buildCreditsGraph } from './credits-graph';
import { computeCreditsIndex } from './credits-index';
import { layoutCreditsGraph, type PositionedGraph } from './credits-layout';

/** Plain data only: it crosses the Astro -> island boundary as a prop. */
export type CreditsView = { line: MadeByLine; listing: CreditListingSection[]; graph: PositionedGraph };

export function buildCreditsViews(cards: { uid: string; title: string; credits?: Credit[] }[]): Map<string, CreditsView> {
  const index = computeCreditsIndex(cards);
  const views = new Map<string, CreditsView>();
  for (const { uid, title, credits } of cards) {
    const base = listingView(credits);
    if (!base || !credits) continue;
    views.set(uid, { ...base, graph: layoutCreditsGraph(buildCreditsGraph(credits, { uid, index, title })) });
  }
  return views;
}
