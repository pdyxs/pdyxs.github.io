// Lens chrome derivation: a pure decision turning a lens definition + the
// active filter state into the strings the chrome renders — the card-mode
// header title and the page-mode site header. Kept side-effect-free so it can
// be unit-tested and reused by both the SSR shell (LensStackCard.astro) and
// the client title updates (CardStack.svelte).
//
// Rules:
//   card title    = "<label>[ · <Filter>]*", except home, whose card title is
//                   the site title — home is the stack root and its spine is
//                   the site's own branding, and it accepts no filters. The
//                   filters are part of what a lens LOCATION IS (see
//                   lens-key.ts), so the title has to say which one you are
//                   looking at — two views of Most* Interesting sitting side
//                   by side in the stack are told apart by nothing else.
//   page subtitle = the SITE's subtitle, authored on the home lens
//                   (`subtitle:` in src/content/what/home.lens.yaml) and the
//                   same on every lens page. It used to be the lens's own
//                   label, which made the site header say what you were
//                   browsing instead of what the site is; the lens names
//                   itself in card mode, and page mode is the root of the
//                   stack, where there is nothing to disambiguate.
// The page-mode H1 is always the site title (page mode is "the front page of
// pdyxs.wtf, viewed through this lens").

import { getLensDefinition, type LensDefinition } from './lens-registry';
import { filtersForKey, lensNameForKey } from './lens-key';
import { DIMENSIONS, selectedValues, type FilterState } from '../dimensions';
import { filterStateFromParams } from '../dimensions/params';

export const SITE_TITLE = 'pdyxs.wtf';

/** The lens whose declaration carries the site-level chrome (its subtitle),
 * and whose own card title is the site title. Identified by id, not dimension
 * — home is filed under 'what' (so it also appears in that panel) but keeps
 * this bespoke chrome regardless. */
const SITE_LENS_ID = 'home';

export interface LensChrome {
  /** Page-mode H1 — always the site title. */
  pageTitle: string;
  /** Card-mode header title. */
  cardTitle: string;
  /** Page-mode subtitle beneath the H1 — the site's, not the lens's.
   * Undefined when the home lens declares none. */
  pageSubtitle?: string;
  /** The lens's footnote, if it declares one — rendered beside the title in
   * card mode, never folded INTO it. Keeping it a separate string is what lets
   * CardStack keep reading `.card-header-title` for a placeholder card's title
   * without picking the footnote up as part of the name. */
  note?: string;
}

/** The site subtitle: authored once, on the home lens. */
export function siteSubtitle(): string | undefined {
  return getLensDefinition(SITE_LENS_ID)?.subtitle;
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
  const cardTitle = lens.id === SITE_LENS_ID
    ? SITE_TITLE
    : [lens.label, ...activeFilterLabels(filterState)].join(' · ');
  return { pageTitle: SITE_TITLE, cardTitle, pageSubtitle: siteSubtitle(), note: lens.note };
}

/**
 * The chrome for a lens LOCATION KEY (`lens/newest?filter.what=what:puzzles`),
 * which is what the stack holds. Null for a card key, or a lens id no longer
 * declared.
 *
 * This is the half of the title that only the client can know: a fragment is
 * fetched by uid and therefore always renders its lens unfiltered, while the
 * location it mounts as carries the filters in its key. CardStack applies the
 * result; this decides it.
 */
export function lensChromeForKey(key: string): LensChrome | null {
  const name = lensNameForKey(key);
  if (!name) return null;
  const lens = getLensDefinition(name);
  if (!lens) return null;
  const params = new URLSearchParams();
  for (const [k, v] of filtersForKey(key)) params.append(k, v);
  return deriveLensChrome(lens, filterStateFromParams(params));
}
