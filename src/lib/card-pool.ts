// The site's one card pool, built once per process.
//
// This is the eleven-step pipeline `LensStackCard.astro` used to run inline in
// its frontmatter:
//
//   getAllCards → .visibility.listed filter → cardOwnValues (over the
//   UNFILTERED list) → getTagRegistry → flattenTagDisplay → dev-only
//   UNINSPECTED_TAG → declaredValues → discoverCollapseConfig →
//   collapseCollections → DIMENSIONS.map(d => d.nodes(ctx)) →
//   serialiseBrowseCards
//
// It is extracted here because a second consumer is coming (`/cards.json`, the
// shared client-side asset — docs/plans/shared-card-pool.md) and the two halves
// have to be byte-identical. Duplicating the pipeline would drift silently,
// showing only as whatever an island renders being subtly wrong.
//
// SERVER-ONLY. This module reaches `browse-card.ts` and therefore
// `astro:assets`; `getImage()` throws if called client-side. It must never be
// imported from a `.svelte` file.

import { serialiseBrowseCards } from './browse-card';
import { getAllCards, type CardMeta } from './cards';
import {
  getTagRegistry,
  getDimensionGroupOrder,
  flattenTagDisplay,
  makeContentTreeReader,
  type TagRegistry,
} from './tag-registry';
import { discoverCollapseConfig, type CollapseConfig } from './collapse-config';
import { collapseCollections, collapsedFolderValues } from './collapse';
import { FIVE_W_DIMENSIONS, type FiveWDimension } from './five-w';
import { cardOwnValues } from './card-identity';
import { DIMENSIONS } from '../dimensions';
import { UNINSPECTED_TAG } from './uninspected-facet';
import type { TagDisplay } from './tag-display';
import type { TagNode } from './browse-helpers';
import type { SerialisedCardFull } from './frontpage';

/**
 * Everything the pipeline derives. The server needs more of it than the client
 * asset does — `LensStackCard` still wants `cardBackedValues` as a `Set`, and
 * `declaredValues`/`collapseConfig` are server-side facts — so the builder
 * returns the whole bundle and `toSharedAsset` picks the client's five keys out
 * of it.
 */
export interface CardPoolBundle {
  /** Every card, unfiltered. */
  allCards: CardMeta[];
  /** The listing pool: cards whose status is publicly listed. */
  listedCards: CardMeta[];
  /**
   * Values that are some card's own uid. Deliberately from the UNFILTERED
   * list — whether a tag points at a specific card is a property of the
   * content graph, not of what's currently listed.
   */
  cardBackedValues: Set<string>;
  registry: TagRegistry;
  groupOrder: Partial<Record<FiveWDimension, string[]>>;
  tagDisplay: Record<string, TagDisplay>;
  declaredValues: string[];
  collapseConfig: CollapseConfig;
  /** `listedCards` with opted-in folders collapsed to one representative. */
  browseCards: CardMeta[];
  hierarchies: Record<string, TagNode[]>;
  /** `browseCards` through the one shared preview serialiser. */
  cards: SerialisedCardFull[];
}

/** The five keys that are byte-identical on every route. */
export interface SharedCardPoolAsset {
  cards: SerialisedCardFull[];
  tagDisplay: Record<string, TagDisplay>;
  hierarchies: Record<string, TagNode[]>;
  groupOrder: Partial<Record<FiveWDimension, string[]>>;
  cardBackedValues: string[];
}

// Module-level memo. This is the DELIBERATE OPPOSITE of the #102 SSR-isolation
// rule (see CLAUDE.md, "Svelte store is the authoritative card-stack state"):
// there, module-level state was a hazard because `astro build` prerenders every
// page in one process, so one page's per-VISITOR state leaked into the next.
// Here the pipeline is a pure function of the content tree — identical for
// every page, holding no visitor state and no per-location identity — so the
// prerenderer's one-process-ness is the asset rather than the hazard. Nothing
// in this pipeline was memoised before; `getAllCards()` re-ran per route.
//
// The PROMISE is cached, not the resolved value, so concurrent callers share
// one build rather than racing two.
//
// Dev staleness is accepted: the dev-reload plugin already restarts the process
// for content-layer changes (see CLAUDE.md, "Content hot-reload").
let poolPromise: Promise<CardPoolBundle> | null = null;

async function build(): Promise<CardPoolBundle> {
  const allCards = await getAllCards();
  // Listing filter (see computeStatusVisibility): the pool every lens/browse/
  // timeline view draws from excludes cards whose status isn't listed (e.g.
  // draft, outside isDev). getAllCards() itself stays unfiltered — the
  // reachability filter (getStaticPaths in card/[...path].astro) applies
  // independently over the same source list.
  const listedCards = allCards.filter(c => c.visibility.listed);
  // Deliberately from the UNFILTERED list: whether a tag points at a specific
  // card is a property of the content graph, not of what's currently listed.
  // Derived from listedCards instead, a draft/unlisted target would drop out
  // and every post tagged with it would prefix-match into that card's parent
  // category. See applyFilters (src/dimensions/apply.ts).
  const cardBackedValues = cardOwnValues(allCards);
  const registry = await getTagRegistry(listedCards);
  const groupOrder = await getDimensionGroupOrder();
  const tagDisplay = flattenTagDisplay(registry);
  // Dev-only `why:uninspected` (see uninspected-facet.ts): not a real tag
  // declaration, so it isn't in the registry — declared here instead, only in
  // dev, so filterVisibleNodes shows it as a chip rather than dropping it as
  // undeclared, and it never appears in a production build.
  if (import.meta.env.DEV) {
    tagDisplay[UNINSPECTED_TAG] = { name: 'Uninspected', declared: true };
  }
  const declaredValues = [
    ...FIVE_W_DIMENSIONS.flatMap(d => registry[d].values),
    ...(import.meta.env.DEV ? [UNINSPECTED_TAG] : []),
  ];

  // Collapse opted-in folders (e.g. story series) to a single representative
  // card BEFORE building hierarchies/counts and serialising — so the results
  // grid, frontpage slots, and dimension-panel counts all browse the collapsed
  // view. The tag registry above stays on the full listed-card list so each
  // folder's declared identity and every value still register. getAllCards()
  // itself is never collapsed: member cards remain real cards for direct nav
  // + series nav.
  const collapseConfig = await discoverCollapseConfig(makeContentTreeReader());
  const browseCards = collapseCollections(listedCards, collapseConfig, v => tagDisplay[v] ?? {});

  // Each dimension enumerates its own offerable values, so there is no
  // hand-injection site here any more — a dimension that renders nowhere (the
  // null dimension) simply returns none, and the dev-only status dimension
  // isn't in the registry at all in a production build.
  // A collapsed folder is offered as one card, so it is not offered as a place
  // to drill into — see NodeContext.excludedValues. Its parent keeps the count.
  const nodeContext = {
    cards: browseCards,
    declaredValues,
    display: tagDisplay,
    cardBackedValues,
    excludedValues: collapsedFolderValues(collapseConfig),
  };
  const hierarchies = Object.fromEntries(
    DIMENSIONS.map(dimension => [dimension.id, dimension.nodes(nodeContext)]),
  );

  // One shared serialiser for every card preview on the site — see
  // browse-card.ts for the thumbnail rules and the explicit-pick invariant.
  const cards = await serialiseBrowseCards(browseCards);

  return {
    allCards,
    listedCards,
    cardBackedValues,
    registry,
    groupOrder,
    tagDisplay,
    declaredValues,
    collapseConfig,
    browseCards,
    hierarchies,
    cards,
  };
}

/** The pipeline, memoised for the life of the process. */
export function buildCardPool(): Promise<CardPoolBundle> {
  poolPromise ??= build();
  return poolPromise;
}

/**
 * The client payload: an EXPLICIT five-key pick, never a spread (CLAUDE.md,
 * "The client payload is an explicit pick, never a spread"). A spread would
 * skip excess-property checking, so every field later added to the bundle
 * would join the shared asset silently.
 *
 * `cardBackedValues` crosses the wire as an array — a `Set` does not serialise.
 */
export function toSharedAsset(bundle: CardPoolBundle): SharedCardPoolAsset {
  return {
    cards: bundle.cards,
    tagDisplay: bundle.tagDisplay,
    hierarchies: bundle.hierarchies,
    groupOrder: bundle.groupOrder,
    cardBackedValues: [...bundle.cardBackedValues],
  };
}
