// Filter generators — build-time derivation of filter tags from card data.
//
// A generator derives extra `dimension:value` filter tags for a card from
// something other than its folder path or frontmatter (e.g. its date). It has
// two faces that MUST stay in sync:
//
//   - `apply(tags, card)` runs per-card in getAllCards() (src/lib/cards.ts) and
//     returns the card's tag list with the generator's tags merged in. Written
//     as a reducer step so generators chain and each sees the prior output.
//   - `allValues()` enumerates every filter value the generator could ever
//     emit, so the short-code manifest build
//     (scripts/generate-stack-manifest.mjs) can assign URL codes to them —
//     runtime-injected tags never touch the filesystem the manifest walks, so
//     without this they'd fall back to raw (long) URL encoding.
//
// Adding a future generator is a single entry in FILTER_GENERATORS; both the
// runtime injection and the manifest pick it up automatically.
//
// This module must stay pure (no Astro, fs, or browser imports) — it is
// imported both by SSR card loading and by the plain-node manifest script.

import { TRAVEL_LOG } from '../data/travel-log.ts';
import { lookupLocationForDate, injectWhereTags } from './where-tags.ts';

/** The card fields a generator may read. Kept minimal and view-free. */
export type FilterGeneratorCard = {
  date?: Date;
};

export type FilterGenerator = {
  /** Returns `tags` with this generator's derived tags merged in. */
  apply(tags: string[], card: FilterGeneratorCard): string[];
  /** Every filter value this generator can emit, for the short-code manifest. */
  allValues(): string[];
};

/**
 * `where:*` location tags derived from the travel log (src/data/travel-log.ts).
 * A card's date is matched against the log's date ranges; a card that already
 * declares a `where:*` tag in frontmatter overrides the derived value (see
 * injectWhereTags).
 */
const travelWhereGenerator: FilterGenerator = {
  apply(tags, { date }) {
    if (!date) return tags;
    return injectWhereTags(tags, lookupLocationForDate(date, TRAVEL_LOG));
  },
  allValues() {
    return [...new Set(TRAVEL_LOG.map(entry => `where:${entry.location}`))];
  },
};

/** The active generators, applied in order. Add new generators here. */
export const FILTER_GENERATORS: FilterGenerator[] = [travelWhereGenerator];

/**
 * Display-name overrides for generated values whose humanised last segment
 * reads wrong — acronyms/initialisms. Applied by the tag registry only to
 * values that are already declared+present, so this affects the label, never
 * panel visibility (post-less locations still don't appear).
 */
const GENERATED_DISPLAY_NAMES: Record<string, string> = {
  'where:europe/uk': 'UK',
  'where:north-america/usa': 'USA',
  'where:asia/uae': 'UAE',
  'where:north-america/usa/washington-dc': 'Washington DC',
};

/** Proper display name for a generated value, or undefined to let it humanise. */
export function generatedDisplayName(value: string): string | undefined {
  return GENERATED_DISPLAY_NAMES[value];
}

/** Runs every generator over a card's tags, returning the augmented list. */
export function generatedTagsForCard(tags: string[], card: FilterGeneratorCard): string[] {
  return FILTER_GENERATORS.reduce((acc, gen) => gen.apply(acc, card), tags);
}

/** Sorted, deduped union of every value any generator can emit (for the manifest). */
export function allGeneratedFilterValues(): string[] {
  return [...new Set(FILTER_GENERATORS.flatMap(gen => gen.allValues()))].sort();
}

/** A value plus every dimensioned ancestor prefix (excl. the bare `dim:` root). */
function withAncestorPrefixes(value: string): string[] {
  const colonIdx = value.indexOf(':');
  if (colonIdx === -1) return [value];
  const dimension = value.slice(0, colonIdx);
  const segments = value.slice(colonIdx + 1).split('/');
  const out: string[] = [];
  let acc = '';
  for (const seg of segments) {
    acc = acc ? `${acc}/${seg}` : seg;
    out.push(`${dimension}:${acc}`);
  }
  return out;
}

/**
 * The generator-emitted values *actually present on content* (intersect the
 * given tag list with what the generators can emit), expanded to include the
 * intermediate ancestor levels a drill-down panel navigates (`where:europe`,
 * `where:europe/uk` for `where:europe/uk/london`).
 *
 * The tag registry treats these as *declared* identities so they surface in the
 * filter panel — a generator is a first-class declaration source, unlike a
 * plain tag that merely appears on a card (those stay hidden; see
 * filterVisibleNodes in browse-helpers.ts). Filtering to present values keeps
 * post-less locations (travelled-through but never written about) out of the
 * panel: every declared value here has at least one matching card, and so does
 * each synthesised ancestor.
 */
export function declaredGeneratedFilterValues(presentTags: Iterable<string>): string[] {
  const emittable = new Set(allGeneratedFilterValues());
  const out = new Set<string>();
  for (const tag of presentTags) {
    if (!emittable.has(tag)) continue;
    for (const prefix of withAncestorPrefixes(tag)) out.add(prefix);
  }
  return [...out].sort();
}
