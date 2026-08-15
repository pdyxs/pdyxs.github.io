// Lens chrome derivation: a pure decision turning a lens definition + the
// active filter state into the strings the chrome renders — the card-mode
// header title and the page-mode subtitle. Kept side-effect-free so it can be
// unit-tested and reused by both the SSR shell (LensStackCard.astro) and the
// client title updates (CardStack.svelte).
//
// Rules:
//   home            → card title = site title (site branding, shown even
//                     when home is collapsed behind another card), page
//                     subtitle = the lens's label
//   any other lens  → title = "<label>[ · <Filter>]*", used for both the
//                     card-mode header and the page-mode subtitle
// The page-mode H1 is always the site title (page mode is "the front page of
// pdyxs.wtf, viewed through this lens").

import type { LensDefinition } from './lens-registry';
import { DIMENSIONS, selectedValues, type FilterState } from '../dimensions';

export const SITE_TITLE = 'pdyxs.wtf';

export interface LensChrome {
  /** Page-mode H1 — always the site title. */
  pageTitle: string;
  /** Card-mode header title. */
  cardTitle: string;
  /** Page-mode subtitle beneath the H1. */
  pageSubtitle: string;
  /** The lens's footnote, if it declares one — rendered beside the title in
   * both chrome modes, never folded INTO it. Keeping it a separate string is
   * what lets CardStack keep reading `.card-header-title` for a placeholder
   * card's title without picking the footnote up as part of the name. */
  note?: string;
}

/** True for the home lens. Identified by id, not dimension — home is filed
 * under the 'what' dimension (so it also appears in that panel) but keeps
 * this bespoke chrome regardless of which dimension it's filed under. */
function isHome(lens: LensDefinition): boolean {
  return lens.id === 'home';
}

/** "what:projects/software-engineering" → "Software Engineering". */
function filterLabel(value: string): string {
  const slashIdx = value.lastIndexOf('/');
  const colonIdx = value.indexOf(':');
  const raw = slashIdx !== -1 ? value.slice(slashIdx + 1) : colonIdx !== -1 ? value.slice(colonIdx + 1) : value;
  return raw
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Human-readable labels for every active filter, in dimension order. */
function activeFilterLabels(filterState: FilterState): string[] {
  // Registry order: the five 5 W dimensions first, then the null dimension,
  // then anything dev-only — so dimensioned filters still lead the title.
  return DIMENSIONS.flatMap(dimension =>
    selectedValues(filterState, dimension.id).map(filterLabel),
  );
}

/** Derives the chrome strings for a lens under the given filter state. */
export function deriveLensChrome(lens: LensDefinition, filterState: FilterState): LensChrome {
  if (isHome(lens)) {
    return { pageTitle: SITE_TITLE, cardTitle: SITE_TITLE, pageSubtitle: lens.label };
  }
  const title = [lens.label, ...activeFilterLabels(filterState)].join(' · ');
  return { pageTitle: SITE_TITLE, cardTitle: title, pageSubtitle: title, note: lens.note };
}
