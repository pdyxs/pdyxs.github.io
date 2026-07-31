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
import { FIVE_W_DIMENSIONS, type FilterState } from './filters';

export const SITE_TITLE = 'pdyxs.wtf';

export interface LensChrome {
  /** Page-mode H1 — always the site title. */
  pageTitle: string;
  /** Card-mode header title. */
  cardTitle: string;
  /** Page-mode subtitle beneath the H1. */
  pageSubtitle: string;
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
  const labels: string[] = [];
  for (const dim of FIVE_W_DIMENSIONS) {
    for (const value of filterState.selections[dim] ?? []) {
      labels.push(filterLabel(value));
    }
  }
  // Dimensionless filters trail the dimensioned ones.
  for (const value of filterState.tags ?? []) {
    labels.push(filterLabel(value));
  }
  return labels;
}

/** Derives the chrome strings for a lens under the given filter state. */
export function deriveLensChrome(lens: LensDefinition, filterState: FilterState): LensChrome {
  if (isHome(lens)) {
    return { pageTitle: SITE_TITLE, cardTitle: SITE_TITLE, pageSubtitle: lens.label };
  }
  const title = [lens.label, ...activeFilterLabels(filterState)].join(' · ');
  return { pageTitle: SITE_TITLE, cardTitle: title, pageSubtitle: title };
}
